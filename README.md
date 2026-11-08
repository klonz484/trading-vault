# Trading Vault — OEM+ ChartScanner

A mobile-first Forex and Gold research workspace built with Next.js, React and TypeScript. The OEM+ visual system uses obsidian black, graphite panels and platinum-silver branding.

## Included in this codebase

- Mobile-first chart upload and camera capture for EURUSD, XAUUSD and selected Forex majors.
- Groq vision-based chart interpretation with a structured BUY / SELL / NO TRADE summary, conditional order type, proposed levels and uncertainty.
- Deterministic checks for trade-plan direction and arithmetic. These checks do **not** validate whether AI-proposed chart levels are technically correct.
- Owner-only authentication gate, Supabase session handling, private scan history and private chart-image storage.
- Browser-local journal and workspace tools.
- Market Data Engine provider adapters, evidence-quality validation and provider-conflict foundations.
- Trading Brain specialist modules, a versioned Scanner–Brain contract and deterministic tests.

## Required environment

Copy `.env.example` to `.env.local` and fill in the required values. Never commit `.env.local`.

- `GROQ_API_KEY` is server-only and powers image analysis.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` configure the Supabase client.
- `TRADING_VAULT_OWNER_USER_ID` is required by the owner-only proxy. It must be the permanent owner's Supabase Auth UUID. Do not deploy the owner-only gate to an environment until this value is configured and the owner login has been verified.
- `TWELVE_DATA_API_KEY` and `ALPHA_VANTAGE_API_KEY` are optional provider credentials. The provider adapters are not activated by default.

## Run locally

```bash
npm ci
npm run lint
npm test
npm run build
npm run dev
```

Open `http://localhost:3000`.

## Data and security boundaries

- Protected pages and API routes require the configured owner identity. Signup URLs redirect to login; public registration remains closed at the application layer.
- Supabase Row Level Security and storage policies remain the data-isolation boundary. The `chart-images` bucket is private and accepts PNG, JPEG and WebP images up to 10 MB.
- The scanner stores chart scans and image paths under the authenticated user's identity. Browser-local history remains a convenience copy, not the authoritative private account record.
- Do not place service-role keys or provider secrets in browser code or `NEXT_PUBLIC_` variables.
- Market Overview must not display prices until an entitled provider, data-quality checks and licensing are verified.
- Market Data Engine adapters are a foundation; no live feed, background polling or production data entitlement is implied.
- Trading Brain specialist modules have explicit lifecycle states. Several remain in development; this is not a fully trained or production-enabled Brain.
- Scanner and Brain remain independent but collaborative. Shared Core Brain changes require controlled experiments and owner approval.
- All execution remains manual in MT5. No order placement, modification or closing is implemented.

## Trading safeguards

Treat all image-based reads and proposed levels as research support. Verify instrument, timeframe, current price, spread, contract details and every level independently in MT5. Confidence remains uncalibrated until a validated scoring method exists. If evidence is incomplete or a scan does not finish normally, the safe result is NO TRADE.
