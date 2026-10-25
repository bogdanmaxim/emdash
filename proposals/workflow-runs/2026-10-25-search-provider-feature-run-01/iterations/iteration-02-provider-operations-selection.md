# Iteration 02 — Provider Operations & Selection

## Scope
Implement provider operations and selection behavior identified in the gap review.

## Completed
- Provider-management contract extended for multi-external provider selection and active provider IDs.
- Provider status model added (`up`, `down`, `degraded`, `lagging`, `indexing`) with timestamps/error metadata.
- Runtime provider state APIs added for status updates and active-provider switching.
- Resolver updated for fail-closed external switching and deterministic database default selection.
- Unit coverage added for switching/default/status/misconfiguration paths.

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
