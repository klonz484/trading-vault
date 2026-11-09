//+------------------------------------------------------------------+
//| TradingVault_RCG_LocalQueue.mq5                                  |
//| Read-only candle/tick collector with local JSON spool.           |
//| No network transport and no trading/account operations.          |
//+------------------------------------------------------------------+
#property strict
#property version   "1.00"
#property description "Trading Vault RCG read-only local collection queue"

input string InpTerminalInstanceId = "rcg-demo-terminal-01";
input int    InpScanIntervalSeconds = 30;
input bool   InpLocalQueueOnly = true;
input int    InpMaxTicksPerSymbolPerScan = 500;
input int    InpMaxTickCursorPrefix = 4095;

// A packed cursor fits exactly in an IEEE-754 double while the timestamp is
// current Unix milliseconds and the same-millisecond ordinal is < 4096.
const long TICK_CURSOR_RADIX = 4096;

string g_canonical[] = {
   "EURUSD", "GBPUSD", "USDJPY", "USDCHF",
   "USDCAD", "AUDUSD", "NZDUSD", "XAUUSD"
};
ENUM_TIMEFRAMES g_timeframes[] = {
   PERIOD_M1, PERIOD_M5, PERIOD_M15, PERIOD_M30,
   PERIOD_H1, PERIOD_H4, PERIOD_D1
};
string g_queueFolder = "TradingVaultRCGQueue";
string g_pendingCandleKeys[];
datetime g_pendingCandleTimes[];
string g_pendingTickKeys[];
long g_pendingTickTimes[];

string JsonEscape(const string value)
{
   string out = "";
   for(int i = 0; i < StringLen(value); i++)
   {
      ushort ch = StringGetCharacter(value, i);
      if(ch == 34) out += "\\"";
      else if(ch == 92) out += "\\\";
      else if(ch == 10) out += "\\n";
      else if(ch == 13) out += "\\r";
      else if(ch == 9) out += "\\t";
      else out += ShortToString(ch);
   }
   return out;
}

string TimeframeName(const ENUM_TIMEFRAMES timeframe)
{
   switch(timeframe)
   {
      case PERIOD_M1:  return "M1";
      case PERIOD_M5:  return "M5";
      case PERIOD_M15: return "M15";
      case PERIOD_M30: return "M30";
      case PERIOD_H1:  return "H1";
      case PERIOD_H4:  return "H4";
      case PERIOD_D1:  return "D1";
   }
   return "UNSUPPORTED";
}

int ServerUtcOffsetMinutes()
{
   // TimeCurrent() is the last quote time while TimeGMT() advances with the
   // local clock. Their seconds can differ, producing false offsets such as
   // -01:01. RCG server offsets are represented as whole-hour offsets here.
   int offsetSeconds = (int)(TimeCurrent() - TimeGMT());
   return (int)(MathRound((double)offsetSeconds / 3600.0) * 60.0);
}

string FormatIsoUtcTime(const datetime value)
{
   string stamp = TimeToString(value, TIME_DATE | TIME_SECONDS);
   StringReplace(stamp, ".", "-");
   StringReplace(stamp, " ", "T");
   return stamp + "Z";
}

string FormatIsoServerTime(const datetime value)
{
   string stamp = TimeToString(value, TIME_DATE | TIME_SECONDS);
   StringReplace(stamp, ".", "-");
   StringReplace(stamp, " ", "T");
   int offset = ServerUtcOffsetMinutes();
   string sign = (offset < 0 ? "-" : "+");
   int absoluteOffset = (int)MathAbs(offset);
   return stamp + sign +
          StringFormat("%02d:%02d", absoluteOffset / 60, absoluteOffset % 60);
}

string CursorKey(const string kind, const string symbol, const string suffix)
{
   string key = "TVRCG." + kind + "." + InpTerminalInstanceId + "." + symbol + "." + suffix;
   StringReplace(key, " ", "_");
   StringReplace(key, "-", "_");
   if(StringLen(key) > 63) key = StringSubstr(key, 0, 63);
   return key;
}

double ReadCursor(const string key)
{
   if(!GlobalVariableCheck(key)) return 0.0;
   return GlobalVariableGet(key);
}

void StageCandleCursor(const string key, const datetime value)
{
   int n = ArraySize(g_pendingCandleKeys);
   ArrayResize(g_pendingCandleKeys, n + 1);
   ArrayResize(g_pendingCandleTimes, n + 1);
   g_pendingCandleKeys[n] = key;
   g_pendingCandleTimes[n] = value;
}

void StageTickCursor(const string key, const long value)
{
   int n = ArraySize(g_pendingTickKeys);
   ArrayResize(g_pendingTickKeys, n + 1);
   ArrayResize(g_pendingTickTimes, n + 1);
   g_pendingTickKeys[n] = key;
   g_pendingTickTimes[n] = value;
}

bool AppendUtf8File(const string path, const string payload)
{
   uchar bytes[];
   int byteCount = StringToCharArray(payload, bytes, 0, WHOLE_ARRAY, CP_UTF8);
   if(byteCount <= 1) return false;

   int handle = FileOpen(path, FILE_WRITE | FILE_BIN);
   if(handle == INVALID_HANDLE)
   {
      Print("TV_RCG_QUEUE_WRITE_FAILED; stage=open; error=", GetLastError());
      return false;
   }

   uint written = FileWriteArray(handle, bytes, 0, byteCount - 1);
   FileFlush(handle);
   FileClose(handle);
   if(written != (uint)(byteCount - 1))
   {
      Print("TV_RCG_QUEUE_WRITE_FAILED; stage=write; expected=",
            byteCount - 1, "; written=", written);
      return false;
   }
   return true;
}

bool PersistBatch(const string batchId, const string payload)
{
   string temporaryPath = g_queueFolder + "\" + batchId + ".tmp";
   string finalPath = g_queueFolder + "\" + batchId + ".json";
   if(!AppendUtf8File(temporaryPath, payload)) return false;

   ResetLastError();
   if(!FileMove(temporaryPath, 0, finalPath, FILE_REWRITE))
   {
      Print("TV_RCG_QUEUE_COMMIT_FAILED; error=", GetLastError());
      return false;
   }
   Print("TV_RCG_QUEUE_SAVED; batchId=", batchId,
         "; file=", finalPath, "; bytes=", StringLen(payload));
   return true;
}

void CommitCursorsAfterQueueSave()
{
   for(int i = 0; i < ArraySize(g_pendingCandleKeys); i++)
   {
      if(!GlobalVariableSet(g_pendingCandleKeys[i], (double)g_pendingCandleTimes[i]))
         Print("TV_RCG_CURSOR_WARNING; kind=candle; key=", g_pendingCandleKeys[i]);
   }
   for(int i = 0; i < ArraySize(g_pendingTickKeys); i++)
   {
      if(!GlobalVariableSet(g_pendingTickKeys[i], (double)g_pendingTickTimes[i]))
         Print("TV_RCG_CURSOR_WARNING; kind=tick; key=", g_pendingTickKeys[i]);
   }
   ArrayResize(g_pendingCandleKeys, 0);
   ArrayResize(g_pendingCandleTimes, 0);
   ArrayResize(g_pendingTickKeys, 0);
   ArrayResize(g_pendingTickTimes, 0);
}

void CollectAndQueue()
{
   ArrayResize(g_pendingCandleKeys, 0);
   ArrayResize(g_pendingCandleTimes, 0);
   ArrayResize(g_pendingTickKeys, 0);
   ArrayResize(g_pendingTickTimes, 0);

   string candlesJson = "";
   string ticksJson = "";
   int candleCount = 0;
   int tickCount = 0;
   int exactMatches = 0;

   for(int i = 0; i < ArraySize(g_canonical); i++)
   {
      string canonical = g_canonical[i];
      bool found = false;
      int total = SymbolsTotal(false);

      for(int s = 0; s < total; s++)
      {
         string brokerSymbol = SymbolName(s, false);
         if(brokerSymbol != canonical) continue;
         found = true;
         exactMatches++;
         break;
      }

      if(!found)
      {
         Print("TV_RCG_SYMBOL_REVIEW_REQUIRED; canonical=", canonical);
         continue;
      }

      int digits = (int)SymbolInfoInteger(canonical, SYMBOL_DIGITS);

      // Collect the most recently closed candle for each configured timeframe.
      for(int t = 0; t < ArraySize(g_timeframes); t++)
      {
         string tf = TimeframeName(g_timeframes[t]);
         string cursorKey = CursorKey("C", canonical, tf);
         datetime previousTime = (datetime)ReadCursor(cursorKey);
         MqlRates rates[];
         ArraySetAsSeries(rates, false);
         datetime fromTime = (previousTime > 0 ? previousTime + 1 : 0);
         int copied = 0;
         ResetLastError();
         if(fromTime > 0)
            copied = CopyRates(canonical, g_timeframes[t], fromTime, TimeCurrent(), rates);
         else
            copied = CopyRates(canonical, g_timeframes[t], 1, 1, rates);
         int ratesError = GetLastError();
         if(ratesError != 0)
         {
            Print("TV_RCG_CANDLE_HISTORY_INCOMPLETE; symbol=", canonical,
                  "; timeframe=", tf, "; error=", ratesError,
                  "; cursor_not_advanced=true");
            continue;
         }
         if(copied <= 0) continue;

         // Exclude the still-forming candle and cap each timeframe slice.
         datetime formingBarTime = iTime(canonical, g_timeframes[t], 0);
         int takeRates = copied;
         if(takeRates > 50) takeRates = 50;
         datetime maxCandleTime = previousTime;
         for(int r = 0; r < takeRates; r++)
         {
            if(rates[r].time <= previousTime || rates[r].time >= formingBarTime) continue;
            if(candleCount > 0) candlesJson += ",";
            candlesJson += "{\"instrument\":\"" + canonical +
               "\",\"brokerSymbol\":\"" + JsonEscape(canonical) +
               "\",\"timeframe\":\"" + tf +
               "\",\"sourceTime\":\"" + FormatIsoServerTime(rates[r].time) +
               "\",\"open\":" + DoubleToString(rates[r].open, digits) +
               ",\"high\":" + DoubleToString(rates[r].high, digits) +
               ",\"low\":" + DoubleToString(rates[r].low, digits) +
               ",\"close\":" + DoubleToString(rates[r].close, digits) +
               ",\"tickVolume\":" + StringFormat("%I64d", rates[r].tick_volume) +
               ",\"realVolume\":" + StringFormat("%I64d", rates[r].real_volume) +
               ",\"spreadPoints\":" + IntegerToString(rates[r].spread) +
               ",\"provisional\":false}";
            candleCount++;
            if(rates[r].time > maxCandleTime) maxCandleTime = rates[r].time;
         }
         if(maxCandleTime > previousTime) StageCandleCursor(cursorKey, maxCandleTime);
         if(copied > takeRates)
            Print("TV_RCG_CANDLE_BACKLOG; symbol=", canonical,
                  "; timeframe=", tf, "; copied=", copied,
                  "; queuedThisScan=", takeRates,
                  "; remaining candles will be collected in later scans");
      }

      // Copy an incremental tick page with a two-part cursor packed into one
      // terminal global variable: timestamp_ms * 4096 + ordinal_at_timestamp.
      // A single value avoids torn writes between separate timestamp/ordinal keys.
      string tickCursorKey = CursorKey("T", canonical, "cursor_v2");
      string legacyTickCursorKey = CursorKey("T", canonical, "time_msc");
      long packedCursor = (long)ReadCursor(tickCursorKey);
      long previousTickMs = 0;
      int previousOrdinal = 0;

      if(packedCursor > 0)
      {
         previousTickMs = packedCursor / TICK_CURSOR_RADIX;
         previousOrdinal = (int)(packedCursor % TICK_CURSOR_RADIX);
      }
      else
      {
         // Safe one-time migration: resume from the old timestamp with ordinal
         // zero. This deliberately replays that millisecond rather than risking
         // a gap; the overlap is local and can be inspected before transmission.
         long legacyTimeMs = (long)ReadCursor(legacyTickCursorKey);
         if(legacyTimeMs > 0)
         {
            previousTickMs = legacyTimeMs;
            previousOrdinal = 0;
            long migratedPacked = previousTickMs * TICK_CURSOR_RADIX;
            if(migratedPacked <= 9007199254740991)
            {
               if(GlobalVariableSet(tickCursorKey, (double)migratedPacked) == 0)
               {
                  Print("TV_RCG_TICK_CURSOR_MIGRATION_FAILED; symbol=", canonical,
                        "; cursor_not_advanced=true");
                  previousTickMs = 0;
               }
            }
            else
            {
               Print("TV_RCG_TICK_CURSOR_UNSAFE_VALUE; symbol=", canonical,
                     "; cursor_not_advanced=true");
               previousTickMs = 0;
            }
         }
      }

      if(previousOrdinal >= InpMaxTickCursorPrefix ||
         previousOrdinal + InpMaxTicksPerSymbolPerScan > InpMaxTickCursorPrefix)
      {
         Print("TV_RCG_TICK_CURSOR_PREFIX_LIMIT; symbol=", canonical,
               "; committedOrdinal=", previousOrdinal,
               "; pageLimit=", InpMaxTicksPerSymbolPerScan,
               "; safetyBound=", InpMaxTickCursorPrefix,
               "; hardStop=true; cursor_not_advanced=true");
      }
      else
      {
         long nowMs = (long)TimeCurrent() * 1000;
         long fromMs = (previousTickMs > 0 ? previousTickMs : nowMs - 60000);
         if(fromMs < 0) fromMs = 0;

         int requestedCount = InpMaxTicksPerSymbolPerScan + previousOrdinal;
         MqlTick ticks[];
         ResetLastError();
         int copiedTicks = CopyTicks(canonical, ticks, COPY_TICKS_ALL,
                                     (ulong)fromMs, requestedCount);
         int ticksError = GetLastError();
         if(ticksError != 0)
         {
            Print("TV_RCG_TICK_HISTORY_INCOMPLETE; symbol=", canonical,
                  "; error=", ticksError, "; cursor_not_advanced=true");
            copiedTicks = 0;
         }

         if(copiedTicks > 0)
         {
            int firstUncommitted = 0;
            bool cursorHistoryValid = true;

            if(previousOrdinal > 0)
            {
               if((long)ticks[0].time_msc != previousTickMs)
               {
                  cursorHistoryValid = false;
               }
               else
               {
                  int sameTimestampPrefix = 0;
                  while(sameTimestampPrefix < copiedTicks &&
                        (long)ticks[sameTimestampPrefix].time_msc == previousTickMs)
                     sameTimestampPrefix++;
                  if(sameTimestampPrefix < previousOrdinal)
                     cursorHistoryValid = false;
                  else
                     firstUncommitted = previousOrdinal;
               }
            }

            if(!cursorHistoryValid)
            {
               Print("TV_RCG_TICK_CURSOR_HISTORY_CHANGED; symbol=", canonical,
                     "; savedTimestampMs=", previousTickMs,
                     "; savedOrdinal=", previousOrdinal,
                     "; returnedFirstTimestampMs=", (long)ticks[0].time_msc,
                     "; hardStop=true; cursor_not_advanced=true");
            }
            else
            {
               int available = copiedTicks - firstUncommitted;
               if(available <= 0)
               {
                  Print("TV_RCG_TICK_NO_NEW_OBSERVATIONS; symbol=", canonical,
                        "; savedTimestampMs=", previousTickMs,
                        "; savedOrdinal=", previousOrdinal,
                        "; cursor_not_advanced=true");
               }
               else
               {
               int take = available;
               if(take > InpMaxTicksPerSymbolPerScan)
                  take = InpMaxTicksPerSymbolPerScan;

               long finalTickMs = (long)ticks[firstUncommitted + take - 1].time_msc;
               int finalTimestampOrdinal = 0;
               for(int p = firstUncommitted + take - 1; p >= firstUncommitted; p--)
               {
                  if((long)ticks[p].time_msc != finalTickMs) break;
                  finalTimestampOrdinal++;
               }
               if(finalTickMs == previousTickMs)
                  finalTimestampOrdinal += previousOrdinal;

               for(int k = firstUncommitted; k < firstUncommitted + take; k++)
               {
                  // Advance through the ordered source stream even if a malformed
                  // quote is omitted from the JSON payload; log the omission.
                  if(ticks[k].bid <= 0.0 || ticks[k].ask <= 0.0 ||
                     ticks[k].ask < ticks[k].bid)
                  {
                     Print("TV_RCG_TICK_OBSERVATION_SKIPPED; symbol=", canonical,
                           "; sourceTimeMs=", (long)ticks[k].time_msc,
                           "; reason=invalid_bid_ask");
                     continue;
                  }

                  if(tickCount > 0) ticksJson += ",";
                  ticksJson += "{\"instrument\":\"" + canonical +
                     "\",\"brokerSymbol\":\"" + JsonEscape(canonical) +
                     "\",\"sourceTimeMs\":" + StringFormat("%I64d", ticks[k].time_msc) +
                     ",\"bid\":" + DoubleToString(ticks[k].bid, digits) +
                     ",\"ask\":" + DoubleToString(ticks[k].ask, digits) +
                     ",\"last\":" + (ticks[k].last > 0.0 ? DoubleToString(ticks[k].last, digits) : "null") +
                     ",\"volume\":" + (ticks[k].volume > 0 ? StringFormat("%I64u", ticks[k].volume) : "null") +
                     ",\"volumeReal\":" + (ticks[k].volume_real > 0.0 ? DoubleToString(ticks[k].volume_real, 8) : "null") +
                     ",\"flags\":" + IntegerToString((int)ticks[k].flags) + "}";
                  tickCount++;
               }

               long newPackedCursor = finalTickMs * TICK_CURSOR_RADIX + finalTimestampOrdinal;
               if(finalTimestampOrdinal >= TICK_CURSOR_RADIX ||
                  newPackedCursor > 9007199254740991)
               {
                  Print("TV_RCG_TICK_CURSOR_UNSAFE_VALUE; symbol=", canonical,
                        "; finalTimestampMs=", finalTickMs,
                        "; finalOrdinal=", finalTimestampOrdinal,
                        "; cursor_not_advanced=true");
               }
               else
               {
                  StageTickCursor(tickCursorKey, newPackedCursor);
               }

               if(take == InpMaxTicksPerSymbolPerScan)
                  Print("TV_RCG_TICK_BATCH_LIMIT_REACHED; symbol=", canonical,
                        "; queuedThisScan=", take,
                        "; finalTimestampMs=", finalTickMs,
                        "; finalTimestampOrdinal=", finalTimestampOrdinal,
                        "; cursorMode=timestamp_plus_ordinal");
               }
            }
         }
      }

      MqlTick latest;
      if(SymbolInfoTick(canonical, latest))
         Print("TV_RCG_SYMBOL; canonical=", canonical,
               "; brokerSymbol=", canonical, "; exact=true; tickAvailable=true",
               "; bid=", DoubleToString(latest.bid, digits),
               "; ask=", DoubleToString(latest.ask, digits));
   }

   if(candleCount == 0 && tickCount == 0)
   {
      Print("TV_RCG_SCAN_EMPTY; no new candle or tick observations");
      return;
   }

   string batchId = "rcg-" + IntegerToString((int)TimeGMT()) + "-" +
                    StringFormat("%I64u", GetTickCount64());
   // sentAt is the batch creation time in UTC, not broker server time.
   // Candle sourceTime remains expressed in the broker server's current offset.
   string sentAt = FormatIsoUtcTime(TimeGMT());
   string payload = "{\"schemaVersion\":\"1.0.0\",\"batchId\":\"" +
      JsonEscape(batchId) + "\",\"brokerId\":\"RCG_MARKETS\",\"terminalInstanceId\":\"" +
      JsonEscape(InpTerminalInstanceId) + "\",\"sentAt\":\"" + sentAt +
      "\",\"candles\":[" + candlesJson + "],\"ticks\":[" + ticksJson + "]}";

   if(PersistBatch(batchId, payload))
   {
      CommitCursorsAfterQueueSave();
      Print("TV_RCG_BATCH_READY; candles=", candleCount,
            "; ticks=", tickCount, "; localOnly=true");
   }
   else
   {
      Print("TV_RCG_BATCH_NOT_COMMITTED; cursors_not_advanced=true; retry_on_next_scan=true");
   }
}

int OnInit()
{
   if(!InpLocalQueueOnly)
   {
      Print("TV_RCG_BLOCKED; this build is local-queue-only; network transport is not implemented");
      return INIT_PARAMETERS_INCORRECT;
   }
   if(StringLen(InpTerminalInstanceId) < 1 || StringLen(InpTerminalInstanceId) > 128)
      return INIT_PARAMETERS_INCORRECT;
   if(InpScanIntervalSeconds < 10 || InpScanIntervalSeconds > 3600)
      return INIT_PARAMETERS_INCORRECT;
   if(InpMaxTicksPerSymbolPerScan < 1 || InpMaxTicksPerSymbolPerScan > 2000 ||
      InpMaxTickCursorPrefix < InpMaxTicksPerSymbolPerScan || InpMaxTickCursorPrefix > 4095)
      return INIT_PARAMETERS_INCORRECT;

   if(!FolderCreate(g_queueFolder))
   {
      // FolderCreate may return false when the folder already exists.
      ResetLastError();
      int probe = FileOpen(g_queueFolder + "\\.probe", FILE_WRITE | FILE_TXT);
      if(probe == INVALID_HANDLE)
      {
         Print("TV_RCG_INIT_FAILED; cannot create local queue folder; error=", GetLastError());
         return INIT_FAILED;
      }
      FileClose(probe);
      FileDelete(g_queueFolder + "\\.probe");
   }

   EventSetTimer(InpScanIntervalSeconds);
   Print("TV_RCG_INIT; local collection queue started; localOnly=true; no network or trading APIs");
   CollectAndQueue();
   return INIT_SUCCEEDED;
}

void OnTimer()
{
   CollectAndQueue();
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   Print("TV_RCG_STOP; reason=", reason,
         "; local queue files are retained for inspection");
}
