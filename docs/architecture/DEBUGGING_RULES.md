# Debugging Rules

## Core rule
Do not fix symptoms before identifying the root cause.

## Required diagnosis order

### Top-down
1. Route
2. Page
3. Container / workspace
4. Orchestration / state ownership
5. UI leaf component

### Bottom-up
1. Function
2. Hook / helper
3. Service
4. API route
5. Database contract

## Change policy
- Fix at the source-of-truth owner layer.
- Avoid child-layer compensation.
- Avoid duplicate state owners for one flow.
- Avoid one-off branching unless it is true compatibility logic.

## Frontend checklist
- Verify route owner
- Verify page/container owner
- Verify actual event owner
- Verify loading/error states
- Verify portal/overlay layers
- Verify browser behavior when links, drag handles, and nested controls exist

## Backend checklist
- Verify schema exists in target DB
- Verify Prisma read/write contract
- Verify compatibility guards for partial rollouts
- Verify transaction cost and timeout
- Verify unique constraints and reindexing strategy

## Before push
Run locally:

```bash
cd /Users/eugrph/Documents/Playground/product-admin-5-beta && npm run build
```

For manual verification:

```bash
cd /Users/eugrph/Documents/Playground/product-admin-5-beta && npm run dev
```

## Push policy
- Do not push to `main` until local verification is approved.
- If DB schema changed, call that out explicitly before push.

