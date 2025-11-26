# Documentation Library

This project follows a docs-driven workflow. Start with a design document, get it approved, then implement.

## Structure
- `main/` – global principles, guidelines, integrations, UI patterns
- `features/` – per-feature designs (one folder per feature)

## Authoring Flow
1. Create/Update the doc under `docs/`
2. Set `status: Draft` and add a changelog entry
3. Once approved, change status to `Approved`
4. Keep docs in sync with implementation (any change resets to Draft)
