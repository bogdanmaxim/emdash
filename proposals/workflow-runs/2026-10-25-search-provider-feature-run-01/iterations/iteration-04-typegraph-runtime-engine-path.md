# Iteration 04 — Typegraph runtime engine path

## Scope

Implement runtime support for external `typegraph` search engine providers and wire search query execution through the configured provider.

## Completed

- Enabled external `typegraph` provider resolution in backend routing.
- Added fail-closed validation for `schema.config.endpoint` (required + valid URL).
- Exposed backend resolution from `FTSManager` for engine-specific dispatch.
- Added typegraph runtime client for `/search`, `/suggest`, and `/stats`.
- Routed `searchWithDb`, `searchCollection`, `getSuggestions`, and `getSearchStats` to typegraph when selected.
- Added/updated tests for provider resolution, misconfiguration fail-closed behavior, and typegraph dispatch.

## Validation

- Targeted tests passed.
- `pnpm lint:quick` passed.
- `pnpm --silent lint:json | jq '.diagnostics | length'` returned `0`.
- `pnpm build` passed.
- `pnpm typecheck` passed.

## EVAL

- Goals completed for this track: yes
- Errors present: no
- Restart required for this track: no
