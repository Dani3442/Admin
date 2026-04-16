# Agent Workflow

## Purpose
This file defines the required working order for any future work on `product-admin-5-beta`.

## Mandatory start-of-task routine
Before fixing a bug, adding a feature, or answering a project-specific question:

1. Read the in-repo architecture notes:
   - `docs/architecture/ARCHITECTURE.md`
   - `docs/architecture/PROJECT_MAP.md`
   - `docs/architecture/DEBUGGING_RULES.md`
   - `docs/architecture/CHANGELOG_ARCHITECTURE.md`
2. Read the Obsidian project knowledge base:
   - `/Users/eugrph/Documents/ObsidianVault/Work Vault/Product Admin/PROJECT_HUB.md`
   - related notes linked from that hub
3. Identify the owner layer before changing code.

## Required working rules
- Do not fix symptoms before identifying the root cause.
- Fix at the source-of-truth owner layer.
- Avoid duplicate logic between UI, API, and services.
- Keep schema compatibility in mind before reading new columns.
- Do not push to `main` until the user explicitly asks for it.

## Required post-fix routine
After every important fix or feature:

1. Explain briefly:
   - root cause
   - owner layer changed
   - files changed
   - what to verify
2. Update project memory:
   - in-repo architecture docs if architecture changed
   - Obsidian notes if the fix affects architecture, workflows, fragile areas, or known dependencies
3. Explicitly tell the user:
   - `Записал в Obsidian`

## Local verification commands
Build:

```bash
cd /Users/eugrph/Documents/Playground/product-admin-5-beta && npm run build
```

Dev server:

```bash
cd /Users/eugrph/Documents/Playground/product-admin-5-beta && npm run dev
```

## Current agreement with the user
- Always consult Obsidian project memory before substantial work.
- Always keep Obsidian updated after important fixes.
- Always mention that the update was recorded in Obsidian.
