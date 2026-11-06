# Install the Market Data Engine foundation package

This archive is intended to merge into the root of the existing repository. It does not contain a second `trading-vault` directory.

## 1. Before extraction

Open the existing Codespace and confirm the workspace is:

```bash
cd /workspaces/trading-vault
pwd
git status --short
git branch --show-current
```

Do not continue if you have uncommitted changes you need to preserve. Commit or stash them first.

## 2. Upload and extract

Upload `market-data-engine-foundation-v0.1.zip` into the Codespace workspace root, then run:

```bash
unzip -o market-data-engine-foundation-v0.1.zip -d .
```

The archive adds new files under:
- `src/lib/market-data/`
- `docs/market-data-engine/`
- `MARKET_DATA_ENGINE_INSTALL.md`

It does not replace existing Scanner, Brain, Supabase or app files.

## 3. Inspect and verify

```bash
find src/lib/market-data docs/market-data-engine -type f -maxdepth 4
npm run lint
npm run build
```

This package is not wired into a user-facing route yet. A successful build verifies integration compatibility, not provider entitlement, licensing or production readiness.

## 4. Secrets

Only after the server-side provider integration is approved, add keys to `.env.local`:

```env
TWELVE_DATA_API_KEY=your_key_here
ALPHA_VANTAGE_API_KEY=your_key_here
```

Never commit `.env.local`. Do not paste credentials into chat or screenshots.

## 5. Stop point

After extraction and checks, stop and review the changed files. Do not deploy, alter Supabase, enable background polling, or enable paid services without separate explicit authorization.
