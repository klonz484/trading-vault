# Trading Vault

A personal trading workspace built with Next.js, React and TypeScript. The current release includes the dashboard, a risk calculator, and an AI chart scanner.

## AI Chart Scanner setup

The scanner uses Groq's vision-capable Qwen 3.8 27B model by default. The model accepts chart screenshots and text context. Groq's free tier is rate-limited; availability and quotas can change, so check your account's limits before relying on it.

1. Create a GroqCloud account and generate an API key at <https://console.groq.com/keys>.
2. Copy `.env.example` to `.env.local`.
3. Put your key in `.env.local`:

   ```env
   GROQ_API_KEY=your_real_key_here
   GROQ_VISION_MODEL=qwen/qwen3.8-27b
   ```

4. Install dependencies and start the app:

   ```bash
   npm install
   npm run dev
   ```

5. Open <http://localhost:3000/scanner>, upload a PNG/JPG/WebP chart screenshot (up to 10 MB), set the instrument and timeframe, and run the analysis.

The API key is read only by the server route at `src/app/api/scanner/analyze/route.ts`; it is not exposed to the browser. Never commit `.env.local` or share your API key. `.env*` files are ignored by Git.

## Scanner limitations and trading safety

The scanner reads only what is visible in the screenshot. It does not receive live market data, cannot guarantee that price levels or indicators are interpreted correctly, and may misread small labels. Verify every observation in MT5. Its output is educational research support, not a trade signal or financial advice. All trade execution remains manual.

## Commands

```bash
npm run dev
npm run build
npm run lint
```

## Planned work

- Validate and improve broker-specific pip valuation in the risk calculator, especially for XAUUSD.
- Build out the journal and AI setups pages.
- Add Supabase persistence for journal records and chart history when configured.
