# Architecture Changelog

## 2026-04-10

### Established architectural docs
- Added a dedicated architecture documentation folder.
- Defined owner layers for products, stages, templates, notifications, and archive.
- Defined debugging rules and local verification workflow.

### Current agreed rules
- Product rename must reuse `PATCH /api/products/[id]` with `name` across all UIs.
- Product right-click actions belong to:
  - list mode owner `ProductsClient.tsx`
  - table mode owner `TableViewClient.tsx`
- Table mode owns separate product and stage context-menu flows.
- Product creation logic should remain centralized.
- Archive should stay as soft-state on `products`, not separate archive tables.
- Archive bulk actions belong to the archive list owner (`ProductsClient.tsx`) and the bulk product API owner (`src/app/api/products/bulk/route.ts`).

### Rollout note
- Schema-dependent features must document whether local/prod DB changes are required.
