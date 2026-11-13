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
  if (cursor.ordinal > prefixLimit) {
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
  if (finalOrdinal > prefixLimit) {
    return { hardStop: true, selected: [], cursor };
  }
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
  const history = Array.from({ length: 21 }, (_, i) => ({
    id: String(i), timeMs: 1000,
  }));
  const result = takePage(history, cursor, 2, 20);
  assert.equal(result.hardStop, true);
  assert.deepEqual(result.cursor, cursor);
  assert.deepEqual(result.selected, []);
});


test("a page may cross into a later millisecond even when ordinal plus page exceeds the prefix limit", () => {
  const history = [
    { id: "a", timeMs: 1000 }, { id: "b", timeMs: 1000 },
    { id: "c", timeMs: 1000 }, { id: "d", timeMs: 1001 },
    { id: "e", timeMs: 1002 },
  ];
  const cursor = { timeMs: 1000, ordinal: 3 };
  const result = takePage(history, cursor, 3, 4);
  assert.equal(result.hardStop, false);
  assert.deepEqual(result.selected.map((tick) => tick.id), ["d", "e"]);
  assert.deepEqual(result.cursor, { timeMs: 1002, ordinal: 1 });
});

test("EA source contains the packed cursor and fail-closed boundary checks", () => {
  assert.match(source, /TICK_CURSOR_RADIX = 4096/);
  assert.match(source, /firstUncommitted = previousOrdinal/);
  assert.match(source, /TV_RCG_TICK_CURSOR_PREFIX_LIMIT/);
  assert.match(source, /TV_RCG_TICK_CURSOR_HISTORY_CHANGED/);
  assert.match(source, /StageTickCursor\(tickCursorKey, newPackedCursor\)/);
});


test("EA JSON escaping and queue paths use valid escaped literals", () => {
  assert.ok(source.includes(String.raw`if(ch == 34) out += "\\\"";`));
  assert.ok(source.includes(String.raw`else if(ch == 92) out += "\\\\";`));
  assert.ok(source.includes(String.raw`g_queueFolder + "\\" + batchId + ".tmp"`));
  assert.ok(source.includes(String.raw`g_queueFolder + "\\" + batchId + ".json"`));
});

test("tick cursor is committed only after the local JSON batch is saved", () => {
  const saveIndex = source.indexOf("if(PersistBatch(batchId, payload))");
  const commitIndex = source.indexOf("CommitCursorsAfterQueueSave();", saveIndex);
  const failureIndex = source.indexOf("TV_RCG_BATCH_NOT_COMMITTED", saveIndex);
  assert.ok(saveIndex >= 0);
  assert.ok(commitIndex > saveIndex);
  assert.ok(failureIndex > commitIndex);
  assert.match(source.slice(saveIndex, failureIndex), /if\(!PersistBatch|CommitCursorsAfterQueueSave/);
});

test("malformed tick observations prevent cursor advancement for that symbol page", () => {
  assert.match(source, /invalidTickSeen = true/);
  assert.match(source, /if\(invalidTickSeen\)/);
  assert.match(source, /cursor_not_advanced=true; valid_records_may_be_replayed=true/);
});

test("EA emits server/UTC clock and per-symbol candle/tick freshness diagnostics", () => {
  assert.match(source, /TV_RCG_CLOCK_DIAGNOSTIC/);
  assert.match(source, /TimeTradeServer\(\)/);
  assert.match(source, /TimeCurrent\(\)/);
  assert.match(source, /TimeGMT\(\)/);
  assert.match(source, /TV_RCG_CANDLE_WINDOW/);
  assert.match(source, /oldestReturned=/);
  assert.match(source, /newestReturned=/);
  assert.match(source, /TV_RCG_TICK_WINDOW/);
  assert.match(source, /oldestReturnedMs=/);
  assert.match(source, /newestReturnedMs=/);
  assert.match(source, /pageFull=/);
  assert.match(source, /latestTickVsServerNowMs=/);
});

test("server-time calculations do not use the potentially stale last-quote clock", () => {
  assert.match(source, /TimeTradeServer\(\) - TimeGMT\(\)/);
  assert.match(source, /CopyRates\(canonical, g_timeframes\[t\], fromTime, TimeTradeServer\(\), rates\)/);
  assert.match(source, /long nowMs = \(long\)TimeTradeServer\(\) \* 1000/);
  assert.doesNotMatch(source, /TimeCurrent\(\) - TimeGMT\(\)/);
});

test("queue commit refuses to overwrite an existing committed batch file", () => {
  const start = source.indexOf("bool PersistBatch");
  const end = source.indexOf("\\nvoid CommitCursorsAfterQueueSave", start);
  const persist = source.slice(start, end);
  assert.ok(start >= 0);
  assert.match(persist, /FileIsExist\\(finalPath\\)/);
  assert.match(persist, /FileMove\\(temporaryPath, 0, finalPath, 0\\)/);
  assert.doesNotMatch(persist, /FILE_REWRITE/);
  assert.match(persist, /TV_RCG_QUEUE_BATCH_ID_COLLISION/);
});
