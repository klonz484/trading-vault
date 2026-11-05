# Trading Vault Master Consolidation Package

**Planning and documentation update — no production deployment or database migration.**

## Source archives already in the repository

- `trading-vault-brain-foundation-v0.2.zip` is already present at the repository root on `main`. This PR adds a one-time, guarded GitHub Actions extraction that places its 48 source/documentation files under `trading-vault-brain/` on this update branch. It refuses to overwrite an existing folder and removes its temporary workflow after a successful extraction.
- The original master-consolidation ZIP supplied for this update contains seven Markdown documents and a PDF. The Markdown documents are represented in this PR under this folder. The binary PDF and original master ZIP have not been uploaded by the GitHub text-file interface.

## Documents

1. `Trading_Vault_Master_Consolidation.pdf` — original human-readable master document (present in the supplied ZIP, not yet in the repository).
2. `MASTER_SPECIFICATION.md` — consolidated product and technical specification.
3. `DECISION_REGISTER.md` — decision approval status and themes; this repository version is a concise transcription, not a verbatim copy of the source register.
4. `RECONCILIATION_AUDIT.md` — artifacts inspected, conflicts and verification limitations.
5. `OPEN_ITEMS.md` — unresolved technical choices that must not be guessed.
6. `IMPLEMENTATION_ROADMAP.md` — proposed build sequence and gates.
7. `TERMINAL_EXTRACTION_GUIDE.md` — Codespaces upload/extract instructions.

The master ZIP contains planning documents only. It does not authorize production deployment, Supabase migrations, secrets or automated trading.
