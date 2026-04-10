# Architecture Changelog

## 2026-04-10

### Established architectural docs
- Added a dedicated architecture documentation folder.
- Defined owner layers for products, stages, templates, notifications, and archive.
- Defined debugging rules and local verification workflow.

### Current agreed rules
- Product right-click actions belong to list mode, not table mode.
- Table mode owns stage interactions, not product context actions.
- Product creation logic should remain centralized.
- Archive should stay as soft-state on `products`, not separate archive tables.

### Rollout note
- Schema-dependent features must document whether local/prod DB changes are required.
