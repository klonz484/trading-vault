//+------------------------------------------------------------------+
//| TradingVault_RCG_Collector.mq5                                   |
//| Read-only preparation scaffold. No orders or account actions.    |
//| Transport is intentionally disabled pending backend release,    |
//| broker permission, and supervised validation.                    |
//+------------------------------------------------------------------+
#property strict
#property version   "0.1.0"
#property description "Trading Vault RCG read-only collector preparation scaffold"

input string InpTerminalInstanceId = "rcg-demo-terminal-01";
input int    InpScanIntervalSeconds = 30;
input bool   InpDryRunOnly = true;

// Canonical instruments expected by Trading Vault. Broker suffixes and
// prefixes must be mapped explicitly after inspecting this broker's symbols.
string g_canonical[] = {
   "EURUSD", "GBPUSD", "USDJPY", "USDCHF",
   "USDCAD", "AUDUSD", "NZDUSD", "XAUUSD"
};

ENUM_TIMEFRAMES g_timeframes[] = {
   PERIOD_M1, PERIOD_M5, PERIOD_M15, PERIOD_M30,
   PERIOD_H1, PERIOD_H4, PERIOD_D1
};

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


// Deliberately conservative: only exact symbol matches are auto-mapped.
// Suffix/prefix variants are reported for manual review and never guessed.
void ScanSymbols()
{
   const int total = SymbolsTotal(false);
   int exactMatches = 0;

   Print("TV_RCG_SCAN_BEGIN; symbols=", total,
         "; terminalInstanceId=", InpTerminalInstanceId,
         "; dryRun=", (InpDryRunOnly ? "true" : "false"));

   for(int i = 0; i < ArraySize(g_canonical); i++)
   {
      const string canonical = g_canonical[i];
      bool found = false;

      for(int s = 0; s < total; s++)
      {
         const string brokerSymbol = SymbolName(s, false);
         if(brokerSymbol == canonical)
         {
            found = true;
            exactMatches++;
            MqlTick tick;
            const bool hasTick = SymbolInfoTick(brokerSymbol, tick);
            const int symbolDigits = (int)SymbolInfoInteger(brokerSymbol, SYMBOL_DIGITS);
            Print("TV_RCG_SYMBOL; canonical=", canonical,
                  "; brokerSymbol=", brokerSymbol,
                  "; exact=true; tickAvailable=", (hasTick ? "true" : "false"),
                  "; bid=", (hasTick ? DoubleToString(tick.bid, symbolDigits) : "n/a"),
                  "; ask=", (hasTick ? DoubleToString(tick.ask, symbolDigits) : "n/a"));
         }
      }

      if(!found)
      {
         Print("TV_RCG_SYMBOL_REVIEW_REQUIRED; canonical=", canonical,
               "; reason=no exact symbol match; automatic alias guessing disabled");
      }
   }

   Print("TV_RCG_SCAN_END; exactMatches=", exactMatches,
         "; configuredInstruments=", ArraySize(g_canonical));
}

int OnInit()
{
   if(StringLen(InpTerminalInstanceId) < 1 ||
      StringLen(InpTerminalInstanceId) > 128)
   {
      Print("TV_RCG_INIT_FAILED; terminal instance ID must be 1-128 characters");
      return INIT_PARAMETERS_INCORRECT;
   }

   if(InpScanIntervalSeconds < 10 || InpScanIntervalSeconds > 3600)
   {
      Print("TV_RCG_INIT_FAILED; scan interval must be 10-3600 seconds");
      return INIT_PARAMETERS_INCORRECT;
   }

   if(!InpDryRunOnly)
   {
      Print("TV_RCG_BLOCKED; this scaffold has no network transport implementation. ",
            "Keep InpDryRunOnly=true until separately reviewed release gates pass.");
      return INIT_PARAMETERS_INCORRECT;
   }

   EventSetTimer(InpScanIntervalSeconds);
   Print("TV_RCG_INIT; read-only dry-run scaffold started. ",
         "No trading functions, order operations, credential handling, or network calls exist.");
   ScanSymbols();
   return INIT_SUCCEEDED;
}

void OnTimer()
{
   ScanSymbols();
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   Print("TV_RCG_STOP; reason=", reason);
}
