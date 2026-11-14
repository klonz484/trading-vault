#!/usr/bin/env python3
"""One-shot, read-only-by-default uploader for Trading Vault MT5 queue batches.

The script never edits MT5 cursors. It reads committed .json files only.
Network transmission requires --send and a token in the environment.
Queue archiving is a separate opt-in and occurs only after an exact durable ACK.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import stat
import sys
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

MAX_BATCH_BYTES = 5 * 1024 * 1024
BROKERS = {"RCG_MARKETS", "VAULT_MARKETS"}
BATCH_ID = re.compile(r"^[A-Za-z0-9._~-]{1,128}$")


class BatchError(ValueError):
    pass


def load_batch(path: Path) -> tuple[bytes, dict[str, Any]]:
    """Read one committed regular file without following symbolic links."""
    try:
        if path.is_symlink():
            raise BatchError("symbolic links are not accepted")
        flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
        fd = os.open(path, flags)
        try:
            info = os.fstat(fd)
            if not stat.S_ISREG(info.st_mode):
                raise BatchError("queue entry is not a regular file")
            if info.st_size <= 0 or info.st_size > MAX_BATCH_BYTES:
                raise BatchError("batch size is empty or exceeds the 5 MB server limit")
            chunks: list[bytes] = []
            total = 0
            while True:
                part = os.read(fd, min(65536, MAX_BATCH_BYTES + 1 - total))
                if not part:
                    break
                total += len(part)
                if total > MAX_BATCH_BYTES:
                    raise BatchError("batch exceeds the 5 MB server limit")
                chunks.append(part)
        finally:
            os.close(fd)
    except OSError as exc:
        raise BatchError(f"could not safely read queue file: {exc}") from exc

    raw = b"".join(chunks)
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise BatchError(f"invalid UTF-8 JSON: {exc}") from exc
    validate_batch(payload)
    return raw, payload


def validate_batch(value: Any) -> None:
    if not isinstance(value, dict):
        raise BatchError("batch must be a JSON object")
    if value.get("schemaVersion") != "1.0.0":
        raise BatchError("unsupported schemaVersion")
    batch_id = value.get("batchId")
    if not isinstance(batch_id, str) or not BATCH_ID.fullmatch(batch_id):
        raise BatchError("invalid batchId")
    if value.get("brokerId") not in BROKERS:
        raise BatchError("unsupported brokerId")
    terminal_id = value.get("terminalInstanceId")
    if not isinstance(terminal_id, str) or not terminal_id.strip() or len(terminal_id) > 128:
        raise BatchError("invalid terminalInstanceId")
    sent_at = value.get("sentAt")
    if not isinstance(sent_at, str) or not sent_at.strip():
        raise BatchError("missing sentAt")
    try:
        datetime.fromisoformat(sent_at.replace("Z", "+00:00"))
    except ValueError as exc:
        raise BatchError("sentAt is not a valid ISO timestamp") from exc
    candles, ticks = value.get("candles"), value.get("ticks")
    if not isinstance(candles, list) or not isinstance(ticks, list):
        raise BatchError("candles and ticks must both be arrays")
    if not candles and not ticks:
        raise BatchError("empty batches are not accepted")
    if len(candles) > 5000 or len(ticks) > 10000:
        raise BatchError("observation count exceeds server limits")


def request_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def retry_delay(headers: Any, attempt: int) -> float:
    retry_after = headers.get("Retry-After") if headers else None
    if retry_after:
        try:
            return min(60.0, max(0.0, float(retry_after)))
        except ValueError:
            try:
                when = parsedate_to_datetime(retry_after)
                return min(60.0, max(0.0, (when - datetime.now(timezone.utc)).total_seconds()))
            except (TypeError, ValueError, OverflowError):
                pass
    return min(30.0, 2.0 ** max(0, attempt - 1))


def post_batch(endpoint: str, token: str, raw: bytes, batch_id: str,
               timeout: float, max_attempts: int) -> tuple[bool, str]:
    parsed = urlparse(endpoint)
    if parsed.scheme != "https" or not parsed.netloc:
        return False, "endpoint must be a valid HTTPS URL"
    if not token or len(token) < 32 or len(token) > 256:
        return False, "collector token is missing or has an invalid length"

    for attempt in range(1, max_attempts + 1):
        request = Request(
            endpoint,
            data=raw,
            method="POST",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "x-tv-request-timestamp": request_timestamp(),
            },
        )
        try:
            with urlopen(request, timeout=timeout) as response:
                status = response.status
                body = response.read(65536)
                headers = response.headers
        except HTTPError as exc:
            status = exc.code
            body = exc.read(65536)
            headers = exc.headers
        except (URLError, TimeoutError, OSError) as exc:
            if attempt == max_attempts:
                return False, f"delivery outcome unknown after {attempt} attempts: {type(exc).__name__}"
            time.sleep(min(30.0, 2.0 ** (attempt - 1)))
            continue

        try:
            result = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            result = {}

        if status in (200, 201):
            exact_ack = (
                isinstance(result, dict)
                and result.get("accepted") is True
                and result.get("acknowledged") is True
                and result.get("durable") is True
                and result.get("batchId") == batch_id
                and isinstance(result.get("receivedAt"), str)
                and bool(result.get("receivedAt"))
            )
            if exact_ack:
                return True, f"durably acknowledged (HTTP {status})"
            return False, f"server response HTTP {status} was not an exact durable acknowledgement"

        if status == 429 or status >= 500:
            if attempt < max_attempts:
                time.sleep(retry_delay(headers, attempt))
                continue
            return False, f"server did not acknowledge batch (HTTP {status}); local file retained"

        detail = result.get("error") if isinstance(result, dict) else None
        return False, f"server rejected batch (HTTP {status}): {detail or 'no safe retry'}"

    return False, "no acknowledgement; local file retained"


def archive_acknowledged(path: Path, queue_dir: Path) -> Path:
    archive_dir = queue_dir / "acknowledged"
    archive_dir.mkdir(mode=0o700, exist_ok=True)
    destination = archive_dir / path.name
    if destination.exists():
        raise BatchError("archive already contains this filename; refusing to overwrite")
    os.replace(path, destination)
    return destination


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--queue-dir", required=True, type=Path,
                        help="MT5 Common/Files/TradingVaultRCGQueue directory")
    parser.add_argument("--endpoint", default=os.environ.get("TRADING_VAULT_MT5_INGEST_URL", ""))
    parser.add_argument("--send", action="store_true",
                        help="enable HTTPS transmission; default is local validation/dry-run only")
    parser.add_argument("--archive-acknowledged", action="store_true",
                        help="move a file only after its exact durable server acknowledgement")
    parser.add_argument("--max-attempts", type=int, default=4)
    parser.add_argument("--timeout", type=float, default=20.0)
    args = parser.parse_args(argv)

    if args.archive_acknowledged and not args.send:
        parser.error("--archive-acknowledged requires --send")
    if not 1 <= args.max_attempts <= 8 or not 1 <= args.timeout <= 120:
        parser.error("--max-attempts must be 1–8 and --timeout 1–120 seconds")
    queue_dir = args.queue_dir.expanduser()
    if not queue_dir.is_dir():
        parser.error("queue directory does not exist or is not a directory")

    token = os.environ.get("TRADING_VAULT_MT5_TOKEN", "")
    if args.send and (not args.endpoint or not token):
        parser.error("--send requires TRADING_VAULT_MT5_INGEST_URL and TRADING_VAULT_MT5_TOKEN environment variables")
    if args.send and urlparse(args.endpoint).scheme != "https":
        parser.error("transmission endpoint must use HTTPS")

    files = sorted(p for p in queue_dir.glob("*.json") if p.is_file() and not p.is_symlink())
    if not files:
        print("No committed .json queue batches found.")
        return 0

    failures = 0
    for path in files:
        try:
            raw, batch = load_batch(path)
        except BatchError as exc:
            print(f"RETAINED {path.name}: {exc}")
            failures += 1
            continue

        batch_id = batch["batchId"]
        if not args.send:
            print(f"DRY-RUN {path.name}: batch={batch_id}, candles={len(batch['candles'])}, ticks={len(batch['ticks'])}; no network or file changes")
            continue

        ok, message = post_batch(args.endpoint, token, raw, batch_id, args.timeout, args.max_attempts)
        if not ok:
            print(f"RETAINED {path.name}: {message}")
            failures += 1
            continue

        print(f"ACKNOWLEDGED {path.name}: {message}")
        if args.archive_acknowledged:
            try:
                destination = archive_acknowledged(path, queue_dir)
                print(f"ARCHIVED {path.name}: {destination}")
            except (OSError, BatchError) as exc:
                print(f"ACKNOWLEDGED BUT NOT ARCHIVED {path.name}: {exc}")
                failures += 1

    if not args.send:
        print("Dry-run complete. No requests were sent and no queue files were changed.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
