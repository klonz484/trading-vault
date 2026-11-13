# Trading Vault MT5 queue uploader

This is a separate Linux/Python process. It does not run inside MT5, does not call trading APIs, and does not modify MT5 global variables or collection cursors.

## Requirements

- Linux (including antiX) and Python 3.10 or newer.
- The existing MT5 local queue folder.
- No third-party Python packages are required.

## Safe dry-run (default)

From the repository root:

\`\`\`bash
python3 -m py_compile connectors/mt5/tradingvault_mt5_uploader.py

python3 connectors/mt5/tradingvault_mt5_uploader.py \
  --queue-dir "$HOME/.mt5/drive_c/Program Files/MetaTrader 5/MQL5/Files/TradingVaultRCGQueue"
\`\`\`

The dry-run validates committed \`.json\` files and reports their batch IDs and observation counts. It sends no network requests and changes no queue files. Temporary \`.tmp\` files are ignored.

If MT5 is installed under a different Wine prefix, use that terminal's actual \`MQL5/Files/TradingVaultRCGQueue\` path.

## Transmission is deliberately disabled

Do not use \`--send\` until all of the following are separately ready and explicitly approved:

1. The private ingestion schema has been reviewed and applied to an isolated non-production Supabase database.
2. The Preview endpoint is configured with the server-only Supabase secret and verified.
3. A scoped, revocable collector token has been deliberately issued for the correct broker and terminal ID.
4. Broker permission for the intended collection and transmission has been confirmed.
5. A supervised synthetic/controlled demo test has been approved.

When approved, the endpoint URL and token are supplied only through environment variables:

- \`TRADING_VAULT_MT5_INGEST_URL\`
- \`TRADING_VAULT_MT5_TOKEN\`

Never put the token in shell history, command-line arguments, source code, screenshots, logs or chat.

The \`--archive-acknowledged\` option is separate and is not enabled by default. It moves a queue file only after an exact durable acknowledgement for that batch ID. Without it, even acknowledged files remain in place and can be retried idempotently.

## Delivery rules

- Only committed regular \`.json\` files are considered; symlinks and temporary files are ignored.
- The original file bytes are sent unchanged.
- The uploader uses a fresh HTTP request timestamp for each attempt while preserving the batch's original \`sentAt\`.
- A timeout is an unknown delivery outcome. The same batch ID and payload are retried.
- Only HTTP 200/201 with \`accepted=true\`, \`acknowledged=true\`, \`durable=true\`, the exact matching \`batchId\`, and a non-empty server \`receivedAt\` count as success.
- Rejections, timeouts, rate limits and server errors do not delete or move the queue file.
- The uploader never advances an MT5 cursor. The collector remains local-queue-only.
