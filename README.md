# Trading Vault — OEM+ ChartScanner

A responsive, mobile-first trading analysis workspace built with Next.js, React and TypeScript. The OEM+ visual system uses obsidian black, graphite panels, platinum-silver branding and restrained semantic colours for trading states.

## Current workspace

- Dashboard and Forex + Gold watchlist
- AI chart scanner with image upload, mobile camera capture and Groq vision analysis
- Browser-local scan history
- Trading Brain architecture overview
- Session setup planning and evidence checklist
- Trading journal with browser-local records
- Journal-based analytics
- Risk calculator using broker-entered pip / point value
- Market overview, profile and workspace settings
- Responsive desktop sidebar and mobile bottom navigation

## AI Chart Scanner setup

The scanner uses Groq's vision-capable Qwen model by default. Availability and free-tier quotas can change.

1. Create a GroqCloud account and generate an API key at <https://console.groq.com/keys>.
2. Copy `.env.example` to `.env.local`.
3. Add your key:

   ```env
   GROQ_API_KEY=your_real_key_here
   GROQ_VISION_MODEL=qwen/qwen3.8-27b
   ```

4. Install dependencies and start the app:

   ```bash
   npm install
   npm run dev
   ```

5. Open <http://localhost:3000/scanner>, upload or take a chart photo, select the instrument and timeframe, and run the analysis.

The API key is read only by the server route at `src/app/api/scanner/analyze/route.ts`; it is not exposed to the browser. Never commit `.env.local` or share your API key. `.env*` files are ignored by Git.

## Data, account and trading boundaries

- Market Overview intentionally shows no prices until a licensed and validated market-data provider is configured.
- The scanner analyses the uploaded image; it is not a live market feed and cannot guarantee that chart levels or indicators are interpreted correctly.
- Successful scan text and journal entries are currently stored in the current browser only. They are not synced to Supabase or another device.
- The Profile page is a design shell. Authentication, registration and multi-user access are not changed by this UI redesign.
- No automated order execution is included. All execution remains manual in MT5.
- The Trading Brain page documents the approved independent-but-collaborative architecture; it does not claim that the full Brain engine is active yet.
- The Risk Calculator requires the trader to enter the broker's pip / point value per standard lot. This avoids guessing the XAUUSD contract value. Verify contract size, tick size, currency conversion, commission and broker volume steps in MT5.

Treat all chart reads and calculator outputs as research support. Verify the information independently before making trading decisions.

## Commands

```bash
npm run dev
npm run lint
npm run build
```

## Next engineering integrations

- Supabase Auth, private profiles, row-level security and approved registration rollout
- Licensed market-data providers and data-quality validation
- Supabase storage and sync for chart history and journal records
- Structured scanner evidence and validated analysis outputs
- Trading Brain reasoning pipeline, experiment registry and owner-controlled Core Brain releases
