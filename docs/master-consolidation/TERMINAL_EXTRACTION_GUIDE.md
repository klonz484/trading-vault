# Codespaces Terminal Extraction Guide

This ZIP contains **documentation only**. It does not contain application source code, Supabase migrations or deployment scripts.

## 1. Upload the ZIP
Upload `trading-vault-master-consolidation.zip` into the root of your existing GitHub Codespace workspace:
`/workspaces/trading-vault`

Do not upload it inside `src/` or inside the existing `trading-vault-brain/` folder.

## 2. Confirm location
In the Codespaces terminal run:

```bash
cd /workspaces/trading-vault
pwd
ls -lah
```

## 3. Inspect the archive before extracting

```bash
unzip -l trading-vault-master-consolidation.zip
```

## 4. Extract into a separate folder

```bash
unzip -o trading-vault-master-consolidation.zip -d .
```

This creates:

```text
trading-vault-master-consolidation/
  README.md
  MASTER_SPECIFICATION.md
  DECISION_REGISTER.md
  RECONCILIATION_AUDIT.md
  OPEN_ITEMS.md
  IMPLEMENTATION_ROADMAP.md
  TERMINAL_EXTRACTION_GUIDE.md
  Trading_Vault_Master_Consolidation.pdf
```

## 5. Inspect the extracted files

```bash
ls -lah trading-vault-master-consolidation
```

Open the PDF from the Codespaces file explorer or read the Markdown files in the editor.

## 6. Safety check — do not stage or deploy yet

```bash
git status --short
```

The archive is documentation-only. Do not run `git add`, `git commit`, database migrations, `npm install`, deployment or merge commands as part of extraction. First review the documents and compare them with the existing `trading-vault-brain/` folder. Keep the current app and Brain scaffold intact.

## 7. Continue
After extraction, share the terminal output of:

```bash
pwd
git branch --show-current
git status --short
find trading-vault-brain -maxdepth 2 -type f | sort | head -80
find trading-vault-master-consolidation -maxdepth 1 -type f | sort
```

Then the next task is a file-by-file reconciliation and a safe implementation plan. No code changes are made by this guide.
