# Iteration 06 — Runnable Typegraph demo service flow

## Scope

Implement objective B by adding a runnable demo flow that configures and serves a Typegraph-style external search provider.

## Completed

- Added optional demo search-provider selection in `demos/simple/astro.config.mjs` via `EMDASH_TYPEGRAPH_DEMO_ENDPOINT`.
- Added demo service endpoints:
  - `POST /typegraph/search`
  - `POST /typegraph/suggest`
  - `GET /typegraph/stats`
- Added demo service implementation that queries EmDash content tables directly and returns normalized payloads expected by the Typegraph runtime adapter.
- Kept the integration opt-in so existing demo behavior is unchanged unless endpoint configuration is provided.

## Validation

- Targeted tests passed:
  - `packages/core/tests/unit/search/backend-routing.test.ts`
- `pnpm lint:quick` passed.
- `pnpm build` passed.
- `pnpm typecheck` passed.
- `pnpm --silent lint:json | jq '.diagnostics | length'` returned `0`.
- `pnpm --filter emdash-demo typecheck` failed in this environment due Astro loading a `virtual:` module during `astro check`.

## EVAL

- Goals completed for this track: yes
- Errors present: no
- Restart required for this track: no
