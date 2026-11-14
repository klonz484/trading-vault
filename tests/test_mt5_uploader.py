import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "connectors" / "mt5"))
import tradingvault_mt5_uploader as uploader


def valid_batch():
    return {
        "schemaVersion": "1.0.0",
        "batchId": "rcg-123-456",
        "brokerId": "RCG_MARKETS",
        "terminalInstanceId": "rcg-demo-terminal-01",
        "sentAt": "2026-11-13T10:00:00Z",
        "candles": [],
        "ticks": [{
            "instrument": "EURUSD", "brokerSymbol": "EURUSD",
            "sourceTimeMs": 1794564000000, "bid": 1.1, "ask": 1.1001,
            "last": None, "volume": None, "volumeReal": None, "flags": 6,
        }],
    }


class Response:
    def __init__(self, status, payload, headers=None):
        self.status = status
        self._payload = json.dumps(payload).encode()
        self.headers = headers or {}

    def read(self, _limit=-1):
        return self._payload

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


class UploaderTests(unittest.TestCase):
    def test_loads_valid_committed_json(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "batch.json"
            path.write_text(json.dumps(valid_batch()), encoding="utf-8")
            raw, batch = uploader.load_batch(path)
            self.assertTrue(raw)
            self.assertEqual(batch["batchId"], "rcg-123-456")

    def test_rejects_bad_schema_and_empty_batches(self):
        bad = valid_batch()
        bad["schemaVersion"] = "9.0"
        with self.assertRaises(uploader.BatchError):
            uploader.validate_batch(bad)
        empty = valid_batch()
        empty["ticks"] = []
        with self.assertRaises(uploader.BatchError):
            uploader.validate_batch(empty)

    def test_rejects_symbolic_link(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            target = root / "real.json"
            target.write_text(json.dumps(valid_batch()), encoding="utf-8")
            link = root / "link.json"
            link.symlink_to(target)
            with self.assertRaises(uploader.BatchError):
                uploader.load_batch(link)

    def test_exact_durable_acknowledgement_is_required(self):
        ack = {
            "accepted": True, "acknowledged": True, "durable": True,
            "batchId": "rcg-123-456", "receivedAt": "2026-11-13T10:01:00Z",
        }
        with patch.object(uploader, "urlopen", return_value=Response(201, ack)):
            ok, _ = uploader.post_batch(
                "https://example.test/ingest", "x" * 43, b"{}", "rcg-123-456", 2, 1
            )
        self.assertTrue(ok)

    def test_wrong_batch_acknowledgement_is_not_accepted(self):
        ack = {
            "accepted": True, "acknowledged": True, "durable": True,
            "batchId": "different-batch", "receivedAt": "2026-11-13T10:01:00Z",
        }
        with patch.object(uploader, "urlopen", return_value=Response(201, ack)):
            ok, _ = uploader.post_batch(
                "https://example.test/ingest", "x" * 43, b"{}", "rcg-123-456", 2, 1
            )
        self.assertFalse(ok)

    def test_non_https_endpoint_is_rejected_before_network(self):
        with patch.object(uploader, "urlopen") as send:
            ok, message = uploader.post_batch(
                "http://example.test/ingest", "x" * 43, b"{}", "rcg-123-456", 2, 1
            )
        self.assertFalse(ok)
        self.assertIn("HTTPS", message)
        send.assert_not_called()

    def test_archive_refuses_to_overwrite_existing_file(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            queued = root / "batch.json"
            queued.write_text("{}", encoding="utf-8")
            archive = root / "acknowledged"
            archive.mkdir()
            (archive / "batch.json").write_text("existing", encoding="utf-8")
            with self.assertRaises(uploader.BatchError):
                uploader.archive_acknowledged(queued, root)
            self.assertTrue(queued.exists())


if __name__ == "__main__":
    unittest.main()
