# Search backend integration spec

This document records the runtime contracts and integration points for EmDash's full-text search system, including the SQLite FTS5 implementation that exists today and the compatibility boundary for libSQL/Turso backends.

The intent is to keep the public search API stable while allowing non-SQLite search engines to plug in without breaking the rest of the CMS.

## Scope

This file covers the integration points that matter for a search backend implementation in EmDash:

- database adapter detection
- backend capability detection
- FTS table lifecycle
- index maintenance and repair
- query execution
- admin API contract
- migration and seed behavior
- fallback behavior for unsupported engines

## Architectural summary

EmDash search is currently implemented around SQLite FTS5, but it is not a standalone search subsystem. It depends on multiple other layers:

- the database adapter layer decides the SQL dialect and runtime behavior
- the collection schema layer defines which fields are searchable
- the FTS manager creates and maintains per-collection internal tables
- the query layer reads those tables and joins back to `ec_<collection>` content rows
- the API layer exposes enable/rebuild operations to the admin UI
- migrations maintain trigger parity across SQLite versions
- seed and import flows auto-enable search for collections that request it

The key invariant is: search is a collection-level capability, not a database-wide feature toggle.

## Current integration map

| Component | File | Responsibility | Contract |
| --- | --- | --- | --- |
| Database adapter descriptor | `packages/core/src/db/adapters.ts` | Declares backend identity and migration metadata | Must be serializable, runtime-safe, and typed for dialect-specific behavior |
| Dialect helpers | `packages/core/src/database/dialect-helpers.ts` | Detects the active SQL engine and SQL dialect helpers | Must not rely on global state or heuristics; each helper must be adapter-backed |
| Search config | `_emdash_collections.search_config` | Stores per-collection search settings | Currently JSON: `{ enabled, weights?, tokenize? }` |
| FTS manager | `packages/core/src/search/fts-manager.ts` | Creates tables, triggers, metadata, repair logic | SQLite-specific today; must become backend-aware |
| Search query layer | `packages/core/src/search/query.ts` | Executes collection search and suggestions | Reads FTS table + joins to content table; handles FTS syntax tolerantly |
| API enable route | `packages/core/src/astro/routes/api/search/enable.ts` | Allows admin to turn search on/off | Returns structured API result and handles DB errors through `handleError()` |
| API rebuild route | `packages/core/src/astro/routes/api/search/rebuild.ts` | Rebuilds an index for a collection | Requires search to be enabled and at least one searchable field |
| Seed flow | `packages/core/src/seed/apply.ts` | Auto-enables search when collection `supports` includes `search` | Must not fail seed if search cannot be enabled |
| WordPress import | `packages/core/src/astro/routes/api/import/wordpress/prepare.ts` | Auto-enables search for imported post/page collections | Best-effort; should skip when the backend is unsupported |
| Collection filter optimization | `packages/core/src/api/handlers/content.ts` | Uses FTS as a fast path for list filtering | Must gate on backend support and table existence |
| Migration 039 | `packages/core/src/database/migrations/039_fix_fts5_triggers.ts` | Repairs legacy FTS trigger corruption | Forward-only, SQLite-only, must stay in sync with FTS triggers |
| Migration 064 | `packages/core/src/database/migrations/064_fts_plain_text.ts` | Rebuilds FTS indexes to the plain-text indexing model | Must remain aligned with search value extraction logic |

## 1. Database adapter contract

File: `packages/core/src/db/adapters.ts`

This file is the configuration entry for a database backend. It describes what EmDash needs from a runtime database adapter.

### Required data model

Every `DatabaseDescriptor` must contain:

- `entrypoint`: runtime entrypoint to load the DB implementation
- `config`: serializable runtime configuration object
- `type`: logical dialect family (`"sqlite" | "postgres"` today)
- `migrations.entrypoint`: migration entrypoint
- `migrations.manifestConfig`: migration-safe configuration for build artifacts
- optional capability flags such as `supportsRequestScope`, `needsLastContentWriteAt`, `supportsCoalescing`, `supportsCollectionDeletionGuard`

### Contract for libSQL/Turso support

When adding a libSQL/Turso backend, the adapter descriptor must expose more than a SQL family label. The descriptor must also communicate search capability or a concrete backend identity so runtime code does not incorrectly treat libSQL as plain SQLite FTS5 by default.

The safest contract is:

- `type` remains the SQL-family classifier when needed for generic SQL behavior
- a separate capability field or backend discriminator identifies the search engine capability

This is required because SQLite compatibility and actual FTS implementation are not the same thing.

### Compatibility rule

The adapter layer must never silently imply that FTS is supported just because the DB is SQLite-compatible. SQLite compatibility is a necessary condition for SQLite FTS5, but it is not sufficient for every libSQL/Turso runtime.

## 2. Dialect helper contract

File: `packages/core/src/database/dialect-helpers.ts`

These helpers are the central runtime feature gate. The file explicitly says the adapter is the source of truth and that helpers must not depend on global heuristics.

### Existing contract

- `detectDialect(db)` returns the DB family using the adapter instance
- `isSqlite(db)` and `isPostgres(db)` are thin wrappers around adapter inspection
- raw SQL compatibility helpers (table existence, column existence, JSON extraction helpers, etc.) are dialect-specific and must remain adapter-aware

### Required extension

For libSQL/Turso support, the dialect helper layer should add feature-based detection, for example:

- `supportsSqliteFts5(db)`
- `supportsTursoNativeFts(db)`
- `detectSearchBackend(db)` or similar

This is not optional. Currently the code treats everything that is not Postgres as SQLite, which is why the FTS manager is effectively hard-wired to SQLite semantics.

### Non-negotiable rule

Every runtime search decision must be based on adapter capability, not on a generic "if not Postgres then SQLite" assumption.

## 3. Search config contract

Search is configured per collection using `_emdash_collections.search_config`.

### Current persisted JSON shape

```json
{
  "enabled": true,
  "weights": {
    "title": 10,
    "body": 5
  },
  "tokenize": "porter unicode61"
}
```

### Supported values today

The public config contract is defined in `packages/core/src/search/types.ts`:

- `enabled: boolean`
- `weights?: Record<string, number>`
- `titleField?: string`
- `tokenize?: "porter unicode61" | "unicode61" | "trigram"`

### Contract for future backends

A backend-specific implementation can add new search config keys only if the config parser and the runtime query layer both understand them. Otherwise it must fall back to the current schema or reject unsupported configuration with a clear error.

The key compatibility rule is: search config remains declarative and serializable, not a runtime-only object.

## 4. FTSManager contract

File: `packages/core/src/search/fts-manager.ts`

This is the main integration boundary for the search index lifecycle.

### Responsibilities

The manager is responsible for:

- naming the per-collection FTS table
- validating collection slugs and field names
- creating the per-collection index table
- creating triggers that keep the index in sync with `ec_<collection>`
- dropping the index and triggers
- rebuilding or repopulating from existing content
- checking index metadata and verifying parity
- exposing search metadata for query execution

### Current naming contract

- FTS table: `_emdash_fts_${collectionSlug}`
- content table: `ec_${collectionSlug}`

These names are treated as safe identifiers and are validated before raw SQL interpolation.

### Current behavior contract

- `enableSearch()` requires at least one searchable field
- `disableSearch()` removes the table and triggers
- `rebuildIndex()` drops/recreates the index and repopulates from content
- `populateRange()` indexes rows in chunks based on rowid ordering
- `verifyAndRepairIndex()` detects missing or drifted indexes and rebuilds them
- `getSearchMetadata()` reads collection metadata and returns the searchable-field list for enabled collections

### Required backend-aware behavior

The current manager is SQLite-only. A future backend contract must be explicitly implemented by the manager or by delegated backend objects.

The manager must not assume that every DB supports FTS5. Instead it must route based on a resolved backend capability object:

- `sqlite-fts5` backend: current behavior preserved
- `turso-native-fts` backend: backend-specific logic
- `unsupported` backend: clear failure / graceful disable path

### Critical invariants

1. The manager never interpolates collection or field names without validation.
2. The index table shape must stay aligned with the migration logic.
3. Soft-deleted rows must not be present in the search index.
4. The index must remain idempotent under repeated rebuilds.
5. Search config must not be silently lost during backend fallback.

## 5. Query layer contract

File: `packages/core/src/search/query.ts`

The query layer is what turns collection metadata and indexed documents into actual search results.

### Responsibilities

- build a search query
- resolve which collections are searchable
- run `MATCH` against the FTS table
- join the FTS table to the content table by `id`
- enforce visibility conditions (`status = 'published'`, `deleted_at IS NULL`)
- localize for the requested locale
- return `SearchResult[]` and `Suggestion[]`

### Current contracts

- search results include:
  - `collection`
  - `id`
  - `slug`
  - `locale`
  - `title?`
  - `snippet?`
  - `score`
- suggestion results include:
  - `collection`
  - `id`
  - `slug?`
  - `title`

### Search backend compatibility rule

The query layer must operate on a backend abstraction. It cannot assume `MATCH` works the same way across engines.

Even if the public API remains identical, each backend must implement the same capabilities or degrade intentionally:

- query support
- prefix matching / autocomplete support
- ranking support (`bm25` or equivalent)
- snippet/highlight support

If a backend cannot satisfy the caller's expected contract, the query layer must return a clean, explicit unsupported-path error or no results rather than a malformed SQL failure.

## 6. API route contract

### Search enable endpoint

File: `packages/core/src/astro/routes/api/search/enable.ts`

Route: `POST /_emdash/api/search/enable`

#### Request body

```ts
{
  collection: string;
  enabled: boolean;
  weights?: Record<string, number>;
  tokenize?: "porter unicode61" | "unicode61" | "trigram";
}
```

#### Response contract

On success:

```ts
{
  success: true,
  data: {
    collection: string;
    enabled: boolean;
    indexed?: number;
  }
}
```

#### Failure handling

- requires `search:manage` permission
- returns `apiError()` for configuration or validation problems
- uses `handleError()` for runtime failures

### Search rebuild endpoint

File: `packages/core/src/astro/routes/api/search/rebuild.ts`

Route: `POST /_emdash/api/search/rebuild`

#### Request body

```ts
{
  collection: string;
}
```

#### Contract

- must fail with `SEARCH_NOT_ENABLED` if search is disabled for the collection
- must fail with `NO_SEARCHABLE_FIELDS` if the collection has no searchable fields
- otherwise rebuilds the index and returns updated stats

### Required backend-aware behavior

Unsupported backend routes must not behave as if the index is silently rebuilt. They should return an explicit API error or a clear disabled state that the UI can render correctly.

## 7. Seed and import contract

### Seed flow

File: `packages/core/src/seed/apply.ts`

The seed logic automatically enables search for collections whose schema declares `supports: ["search"]`.

#### Contract

- if a collection has searchable fields, try to enable search
- if no fields are available, skip quietly
- if backend support is unavailable, warn and continue rather than causing seed failure

This is important because seed and import are often operational rather than admin-driven; they must fail gracefully.

### WordPress import

File: `packages/core/src/astro/routes/api/import/wordpress/prepare.ts`

This import path auto-enables search for common content types (`posts`, `pages`, etc.) as part of preparation.

#### Contract

- it must not crash import if search cannot be enabled
- it should treat unavailable search backend as a skip, not a hard failure

## 8. Migration contract

### Migration 039

File: `packages/core/src/database/migrations/039_fix_fts5_triggers.ts`

This migration repairs legacy trigger corruption for SQLite FTS indexes.

#### Contract

- it runs only when the database is SQLite-backed
- it inspects every collection with `search_config.enabled = true`
- it drops/rebuilds the index when the trigger contract is corrupted
- it must remain in lockstep with `FTSManager.createTriggers()`

### Migration 064

File: `packages/core/src/database/migrations/064_fts_plain_text.ts`

This migration switches FTS indexing to a plain-text extraction model for portable text fields.

#### Contract

- it is forward-only
- it is SQLite-only
- the extraction expression must stay aligned with `FTSManager.searchValueExpr()`
- if a backend is unsupported, there is no implicit migration path; the backend must either implement equivalent logic or skip it explicitly

### Hard rule

If the FTS manager and a migration are both derived from the same SQLite-only logic, any new backend must either:

- provide an equivalent backend-specific migration, or
- deliberately skip the migration and mark the feature unsupported

Do not silently mutate data in ways that make SQLite assumptions false.

## 9. List-filter optimization contract

File: `packages/core/src/api/handlers/content.ts`

There is a fast path that uses FTS to optimize list filtering when search is enabled and when the queried columns are covered by the index.

### Condition

`canUseFtsForListFilter()` returns true only if:

- the DB is SQLite
- the collection has search enabled
- the requested search columns are covered by the searchable field set
- the FTS table exists

### Contract

This optimization is intentionally SQLite-bound. A non-SQLite backend must either provide an equivalent planner optimization or simply return false and use the slower path.

## 10. Required behavior for libSQL/Turso integration

The current implementation is SQLite FTS5 only. A libSQL/Turso implementation must satisfy the following contract before being considered complete.

### Required capabilities

- collection-scoped search configuration persists in `_emdash_collections.search_config`
- index lifecycle is managed per collection, not globally
- searchable fields remain driven by `_emdash_fields.searchable`
- query execution remains compatible with the public search API
- migration paths remain explicit and backed by capability checks
- unsupported engines do not create broken indexes or silently use SQLite SQL assumptions

### Required fallback behavior

When a database backend does not provide the necessary FTS engine:

- do not enable search silently
- do not create fake SQLite FTS tables on a non-SQLite engine
- do not emit malformed `MATCH` queries
- either return a clear `SEARCH_NOT_SUPPORTED` type error or mark search disabled in config

### Required operational behavior

- search enable flows should be idempotent
- rebuild flows should be safe to run repeatedly
- stats queries should return `null` or an empty result for unsupported backends rather than throwing
- seed and import flows should degrade gracefully

## 11. Implementation boundaries for a backend adapter

A new backend should be introduced at the following boundaries:

1. adapter runtime descriptor in `db/adapters.ts`
2. dialect/capability detection in `database/dialect-helpers.ts`
3. backend delegation in `search/fts-manager.ts`
4. optional backend-specific query path or compatibility layer in `search/query.ts`
5. API and UI error handling remains unchanged because the public API contract is stable

This keeps the public contract stable while allowing backend internals to vary.

## 12. Acceptance checklist

A new search backend is considered integrated when all of the following hold:

- collection-level search config still persists in `_emdash_collections`
- a collection can be enabled and disabled without corrupting the schema
- query/search/suggestion calls work with the same public response shapes
- unsupported backends fail explicitly instead of generating SQLite-only SQL
- seed/import flows remain non-fatal on unsupported runtimes
- migrations and runtime index creation stay aligned for the target backend
- no part of the general content API relies on SQLite-specific assumptions unless guarded by capability checks

## 13. Summary

The real integration boundary in EmDash is not one giant search subsystem. It is a chain of contracts across adapters, collection metadata, index lifecycle, and query execution.

The current codebase implements the SQLite FTS5 variant of that contract. A libSQL/Turso backend must be inserted by preserving the same public contract while replacing the backend-specific search engine logic with explicit capability detection and backend delegation.

That is the boundary to implement cleanly.

## Related source files

- `packages/core/src/db/adapters.ts`
- `packages/core/src/database/dialect-helpers.ts`
- `packages/core/src/search/types.ts`
- `packages/core/src/search/fts-manager.ts`
- `packages/core/src/search/query.ts`
- `packages/core/src/search/index.ts`
- `packages/core/src/astro/routes/api/search/enable.ts`
- `packages/core/src/astro/routes/api/search/rebuild.ts`
- `packages/core/src/seed/apply.ts`
- `packages/core/src/api/handlers/content.ts`
- `packages/core/src/database/migrations/039_fix_fts5_triggers.ts`
- `packages/core/src/database/migrations/064_fts_plain_text.ts`

This document is the contract reference for backend-specific work; keep it aligned with any future search implementation changes.
