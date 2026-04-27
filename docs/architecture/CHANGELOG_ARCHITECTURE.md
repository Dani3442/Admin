# Architecture Changelog

## 2026-04-20

### Parallel template stages
- Fixed the product-template scheduling contract so adjacent stages can remain on the same date without being force-shifted on save.
- Root cause was split across three layers:
  - `product_template_stages` did not persist `participatesInAutoshift`
  - `src/lib/stage-schedule.ts` always treated the chain as strictly sequential
  - `src/lib/product-create.ts` recalculated template stages again when creating a product
- Added `product_template_stages.participatesInAutoshift`
- Updated template create/update/read flows to persist and return the flag with compatibility guards
- Updated schedule math so a same-day adjacent pair is treated as a parallel block and only the last stage in that block shifts following stages

### Product template stage create compatibility
- Fixed template save/create on databases that do not yet have `product_template_stages.participatesInAutoshift`.
- Root cause: Prisma `productTemplateStage.create()` still targeted the new column even when the route used compatibility checks.
- Introduced a compat insert owner in `src/lib/product-template-stage-compat.ts` and routed template stage inserts through it.

### Stage date issue labeling
- Fixed the stage issue wording so out-of-order dates are no longer shown as "Пересечение".
- Root cause: `detectStageOverlaps()` already emitted two distinct issue kinds (`same_day_cluster` and `out_of_order`), but UI labels treated both as the same overlap warning.
- Added explicit issue labels and summaries in `src/lib/utils.ts`:
  - same-day parallel date block
  - out-of-order date sequence
- Updated list, card, timeline, and filter wording to use the generalized "проблемы с датами" language where the UI is not referring to the exact issue kind.

### Same-day pair detection
- Fixed same-day date problems for two adjacent stages not being detected at all.
- Root cause: `detectStageOverlaps()` only created a `same_day_cluster` issue when a date bucket contained 3 or more stages, so a pair with the same date silently passed validation.
- Changed the source-of-truth threshold in `src/lib/utils.ts` from 3 to 2 so pairs now surface consistently in:
  - product card
  - list mode
  - table mode
  - risk calculations

### Date edit overlap reset scope
- Fixed manual stage date edits in the product card not re-showing date issues consistently.
- Root cause: `src/app/api/stages/route.ts` only reset overlap acceptance for the edited stage, while the actual affected segment includes the previous neighbor and all recalculated following stages.
- Updated the route so a date change clears accepted overlap state for the whole affected chain segment before recalculating derived fields and risk.

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

## 2026-04-17

### Product template selector and deletion rule
- Product creation template choice now belongs to the custom selector in `src/components/products/NewProductForm.tsx`, not a native browser `<select>`.
- Product-template deletion from the creation flow belongs to `src/app/api/product-templates/[id]/route.ts`.
- After template deletion succeeds, the form must immediately:
  - remove the template from local `templates` state
  - clear `productTemplateId` if the deleted template was selected
  - reset the selected template stage override state
