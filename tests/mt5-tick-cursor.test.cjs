/* global require */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync(
  require("node:path").join(__dirname, "../connectors/mt5/TradingVault_RCG_LocalQueue.mq5"),
  "utf8",
);

// Executable reference model for the EA's CopyTicks(timestamp, ordinal + page)
// pagination contract. MetaEditor compilation and broker-history validation
// remain separate acceptance gates.
function takePage(history, cursor, pageSize, prefixLimit) {
  if (cursor.ordinal + pageSize > prefixLimit) {
    return { hardStop: true, selected: [], cursor };
  }
  const response = history
    .filter((tick) => tick.timeMs >= cursor.timeMs)
    .slice(0, cursor.ordinal + pageSize);

  let first = 0;
  if (cursor.ordinal > 0) {
    if (response.length === 0 || response[0].timeMs !== cursor.timeMs) {
      return { hardStop: true, selected: [], cursor };
    }
    let sameTimestamp = 0;
    while (sameTimestamp < response.length &&
      response[sameTimestamp].timeMs === cursor.timeMs) sameTimestamp++;
    if (sameTimestamp < cursor.ordinal) {
      return { hardStop: true, selected: [], cursor };
    }
    first = cursor.ordinal;
  }

  const selected = response.slice(first, first + pageSize);
  if (selected.length === 0) return { hardStop: false, selected, cursor };
  const finalTime = selected[selected.length - 1].timeMs;
  let finalOrdinal = 0;
  for (let i = selected.length - 1; i >= 0 &&
    selected[i].timeMs === finalTime; i--) finalOrdinal++;
  if (finalTime === cursor.timeMs) finalOrdinal += cursor.ordinal;
  return {
    hardStop: false,
    selected,
    cursor: { timeMs: finalTime, ordinal: finalOrdinal },
  };
}

test("same-millisecond page boundary replays and skips only committed prefix", () => {
  const history = [
    { id: "a", timeMs: 1000 }, { id: "b", timeMs: 1000 },
    { id: "c", timeMs: 1000 }, { id: "d", timeMs: 1000 },
    { id: "e", timeMs: 1001 }, { id: "f", timeMs: 1001 },
  ];
  const first = takePage(history, { timeMs: 1000, ordinal: 0 }, 2, 20);
  const second = takePage(history, first.cursor, 2, 20);
  const third = takePage(history, second.cursor, 2, 20);
  assert.deepEqual(
    [...first.selected, ...second.selected, ...third.selected].map((tick) => tick.id),
    ["a", "b", "c", "d", "e", "f"],
  );
  assert.deepEqual(second.cursor, { timeMs: 1000, ordinal: 4 });
  assert.deepEqual(third.cursor, { timeMs: 1001, ordinal: 2 });
});

test("crossing into a later millisecond resets the ordinal to that timestamp", () => {
  const history = [
    { id: "a", timeMs: 1000 }, { id: "b", timeMs: 1000 },
    { id: "c", timeMs: 1000 }, { id: "d", timeMs: 1001 },
    { id: "e", timeMs: 1001 }, { id: "f", timeMs: 1002 },
  ];
  const first = takePage(history, { timeMs: 1000, ordinal: 0 }, 4, 20);
  assert.deepEqual(first.selected.map((tick) => tick.id), ["a", "b", "c", "d"]);
  assert.deepEqual(first.cursor, { timeMs: 1001, ordinal: 1 });
  const second = takePage(history, first.cursor, 3, 20);
  assert.deepEqual(second.selected.map((tick) => tick.id), ["e", "f"]);
  assert.deepEqual(second.cursor, { timeMs: 1002, ordinal: 1 });
});

test("prefix safety bound hard-stops without moving the cursor", () => {
  const cursor = { timeMs: 1000, ordinal: 19 };
  const result = takePage([{ id: "a", timeMs: 1000 }], cursor, 2, 20);
  assert.equal(result.hardStop, true);
  assert.deepEqual(result.cursor, cursor);
  assert.deepEqual(result.selected, []);
});

test("EA source contains the packed cursor and fail-closed boundary checks", () => {
  assert.match(source, /TICK_CURSOR_RADIX = 4096/);
  assert.match(source, /firstUncommitted = previousOrdinal/);
  assert.match(source, /TV_RCG_TICK_CURSOR_PREFIX_LIMIT/);
  assert.match(source, /TV_RCG_TICK_CURSOR_HISTORY_CHANGED/);
  assert.match(source, /StageTickCursor\(tickCursorKey, newPackedCursor\)/);
});
