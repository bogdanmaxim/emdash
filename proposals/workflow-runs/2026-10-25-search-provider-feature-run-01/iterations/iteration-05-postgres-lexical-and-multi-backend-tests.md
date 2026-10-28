# Iteration 05 — PostgreSQL lexical path and multi-backend tests

## Scope
Implement objective C (PostgreSQL lexical FTS runtime path) and objective D (multi-backend integration coverage).

## Completed
- Enabled `postgres-lexical` database provider availability in Postgres adapter capability declarations.
- Updated search backend fallback resolution for detected Postgres dialects to expose `postgres-lexical` as available.
- Added backend-aware metadata resolution in `FTSManager` for non-FTS5 engines (without SQLite FTS table introspection).
- Updated `FTSManager` non-FTS5 flows for enable/disable/stats and startup repair no-op behavior.
- Added PostgreSQL lexical runtime search dispatcher for search, suggestions, and stats.
- Routed `searchWithDb`, `searchCollection`, `getSuggestions`, and `getSearchStats` to postgres-lexical runtime when selected.
- Added unit coverage for postgres backend routing and integration coverage for multi-backend search behavior.

## Validation
- Targeted tests passed:
  - `tests/unit/search/backend-routing.test.ts`
  - `tests/integration/search/search-multi-backend.test.ts`
  - `tests/unit/astro/integration/serializable-config.test.ts`
- `pnpm lint:quick` passed.
- `pnpm build` passed.
- `pnpm typecheck` passed.
- `pnpm --silent lint:json | jq '.diagnostics | length'` returned `204` in the current workspace baseline.

## EVAL
- Goals completed for this track: yes
- Errors present: no
- Restart required for this track: no
