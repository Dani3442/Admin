# Project Map

## Routes
- `/dashboard` — main overview
- `/products` — products workspace with list/table layouts
- `/products/new` — product creation
- `/products/[id]` — product details card
- `/archive` — archived products
- `/timeline` — product timeline
- `/profile` — current user profile
- `/users` — users list
- `/users/[id]` — user profile/details

## UI owners
- Global shell/header: `src/components/layout`
- Products workspace: `src/components/products/ProductsWorkspace.tsx`
- Products list mode: `src/components/products/ProductsClient.tsx`
- Products table mode: `src/components/table/TableViewClient.tsx`
- Product details card: `src/components/products/ProductCardClient.tsx`
- Product creation form: `src/components/products/NewProductForm.tsx`

## API owners
- Products:
  - `src/app/api/products/route.ts`
  - `src/app/api/products/[id]/route.ts`
  - `src/app/api/products/bulk/route.ts`
  - `src/app/api/products/reorder/route.ts`
- Stages:
  - `src/app/api/stage-templates/route.ts`
  - `src/app/api/stages/route.ts`
  - `src/app/api/products/[id]/stages/route.ts`
- Product templates:
  - `src/app/api/product-templates/route.ts`
  - `src/app/api/product-templates/[id]/route.ts`
- Comments: `src/app/api/comments/route.ts`
- Notifications: `src/app/api/notifications/route.ts`
- Users: `src/app/api/users/route.ts`, `src/app/api/users/[id]/route.ts`

## Shared logic
- Navigation helpers: `src/lib/navigation.ts`
- Product creation: `src/lib/product-create.ts`
- Product list filtering/sorting: `src/lib/product-list.ts`
- Stage scheduling: `src/lib/stage-schedule.ts`
- Schema compatibility: `src/lib/schema-compat.ts`
- Product stage compatibility: `src/lib/product-stage-compat.ts`
- Risk calculation: `src/lib/risk.ts`
- Generic utils: `src/lib/utils.ts`

## Database entities
- `products`
- `product_stages`
- `stage_templates`
- `product_templates`
- `product_template_stages`
- `comments`
- `change_history`
- `users`

## Known mode ownership
- Right-click product actions:
  - list mode only
  - not table mode
- Right-click stage actions:
  - table mode
- Archive actions:
  - product API owner
- Notifications badge:
  - header UI + notifications API
