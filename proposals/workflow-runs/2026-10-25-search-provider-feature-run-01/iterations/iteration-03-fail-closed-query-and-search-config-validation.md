# Iteration 03 — Fail-closed query guards and search provider config validation

## Scope
Add explicit fail-closed behavior for unsupported search backends at query/API entrypoints and validate search provider selection config at integration serialization time.

## Completed
- Added fail-closed guards in `searchWithDb`, `searchCollection`, `getSuggestions`, and `getSearchStats`.
- Added fail-closed API guards for `/api/search`, `/api/search/suggest`, and `/api/search/stats`.
- Added `provider-selection-schema` validator helpers and exported them from search/public API.
- Added tests for unsupported query behavior and provider selection validation.

## Validation
- Targeted tests passed.
- `pnpm lint:quick` passed.
- `pnpm build` passed.
- `pnpm typecheck` passed.
- `pnpm --silent lint:json | jq '.diagnostics | length'` returned `0`.

## EVAL
- Goals completed for this track: yes
- Errors present: no
- Restart required for this track: no
