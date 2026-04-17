# Product Admin Architecture

## Purpose
This document is the single source of truth for the architecture of the project.
Before changing business logic, routes, or UI flows, start here and verify the owner layer.

## Main domains

### Products
- Active products live in `products`.
- Product list page: `src/app/(dashboard)/products/page.tsx`
- Product workspace container: `src/components/products/ProductsWorkspace.tsx`
- List mode owner: `src/components/products/ProductsClient.tsx`
- Table mode owner: `src/components/table/TableViewClient.tsx`
- Product details page: `src/app/(dashboard)/products/[id]/page.tsx`
- Product API:
  - `src/app/api/products/route.ts`
  - `src/app/api/products/[id]/route.ts`
  - `src/app/api/products/bulk/route.ts`
  - `src/app/api/products/reorder/route.ts`

### Stages
- Global stage columns are stored in `stage_templates`.
- Product stage instances are stored in `product_stages`.
- Global stage template API owner: `src/app/api/stage-templates/route.ts`
- Product stage API owner: `src/app/api/stages/route.ts`
- Product-specific stage API owner: `src/app/api/products/[id]/stages/route.ts`

### Product templates
- Product templates live in `product_templates` and `product_template_stages`.
- Product template API owner:
  - `src/app/api/product-templates/route.ts`
  - `src/app/api/product-templates/[id]/route.ts`
- Product creation service owner: `src/lib/product-create.ts`

### Comments and notifications
- Comments API owner: `src/app/api/comments/route.ts`
- Notification API owner: `src/app/api/notifications/route.ts`
- Header notification UI owner: `src/components/layout/Header.tsx`

### Archive
- Archive is soft-state on `products`, not a separate data silo.
- Archive page: `src/app/(dashboard)/archive/page.tsx`
- Archive/close/restore product actions owner: `src/app/api/products/[id]/route.ts`
- Archive bulk restore/delete owner: `src/app/api/products/bulk/route.ts`

## Source-of-truth rules

### Product list interactions
- List mode product context menu owner: `src/components/products/ProductsClient.tsx`.
- Table mode product context menu owner: `src/components/table/TableViewClient.tsx`.
- Product rename uses one shared server contract: `PATCH /api/products/[id]` with `name`.
- Table mode owns two separate context-menu flows:
  - product row actions
  - stage actions
- Product and stage context menus in table mode must stay isolated and close each other before opening.

### Product creation
- Product creation UI owner: `src/components/products/NewProductForm.tsx`
- Product creation business logic owner: `src/lib/product-create.ts`
- Avoid splitting creation flow across unrelated modal/page owners.
- Template selection in product creation must use the system-styled custom selector, not a native browser `<select>`.
- Product-template deletion from the creation flow must go through `src/app/api/product-templates/[id]/route.ts`.

### Stage scheduling
- Scheduling math owner: `src/lib/stage-schedule.ts`
- UI must not implement its own independent date chain logic.
- APIs and forms must both use the same schedule helper.

### Archive behavior
- Archive is represented by product fields like `isArchived`, `archivedAt`, `archivedById`.
- Do not move archived products to separate tables.
- History, comments, stages, and metadata stay attached to the original product.

## Compatibility policy
- Production and local databases may lag behind the latest Prisma schema.
- Any code that reads new columns must either:
  - depend on a completed schema rollout, or
  - use compatibility checks from `src/lib/schema-compat.ts`
- Do not assume new columns exist in every environment.

## Current fragile areas
- Product list and table interactions
- Stage deletion and stage reindexing
- Product creation flow from templates
- Notifications read/unread semantics
- Archive schema rollout compatibility

## Safe change order
1. Data contract / schema
2. Service or business logic owner
3. API route owner
4. Page/container orchestration
5. UI rendering
6. Loading/error states
7. Local verification
