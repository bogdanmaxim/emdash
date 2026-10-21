---
title: Search backend support for libSQL and Turso
type: feature-plan
status: proposed
authors:
  - Bogdan Maxim (@bogdanmaxim)
discussion: null
created: 2026-10-21
---

# Search backend support for libSQL and Turso

## Problem and user case

EmDash currently exposes collection-level full-text search as a SQLite FTS5 feature. The database adapters support SQLite, libSQL, and PostgreSQL, and the project also includes a Turso-backed configuration, but the search layer still hard-codes SQLite-specific behavior.

This creates a mismatch between the supported database adapters and the actual feature implementation. A site configured with libSQL or Turso can connect successfully, but collection search fails or is silently limited because the search manager only works when the backend is SQLite.

This affects users who deploy EmDash to a libSQL/Turso environment and expect collection search to behave the same way as SQLite-backed sites.

## Proposed behavior

Add provider-aware full-text search support so each database engine can expose its own FTS implementation, and users can optionally select an external FTS provider.

The intended runtime behavior is:

- The database backend may provide a native FTS capability declaration (implemented or unsupported, with a reason).
- Users can configure the active FTS provider similarly to database provider configuration:
  - use the database-provided provider (default), or
  - choose an external provider.
- `FTSManager` becomes the central orchestrator: it resolves the configured provider, determines whether FTS is active, and returns standardized errors.
- SQLite FTS5 remains the current implemented engine path; other providers can be added without changing the collection search API.

The collection-level API remains stable: collections keep the same searchable-field metadata and search configuration, while the backend-specific implementation is hidden behind the search manager abstraction.

Important nuance: official libSQL docs and repo guidance still describe libSQL as a SQLite-compatible fork with FTS5 support, while the Turso Database product moved to a separate native FTS implementation in newer server/engine versions. This means the correct decision is capability-based, not a blanket "all libSQL equals SQLite" rule. We should default to the FTS5 path for libSQL when present, but allow the engine to opt into the newer Turso backend when the runtime no longer exposes the legacy SQLite FTS5 features.

## Goals

- Support backend-specific full-text search implementations without changing collection schema or public APIs.
- Support external FTS providers through explicit configuration.
- Preserve the existing SQLite FTS5 implementation as the reference backend.
- Fail explicitly and clearly when:
  - the selected backend does not support FTS, or
  - an external provider is not configured or not working.
- Keep code paths for search configuration, indexing, and query execution isolated by database backend.

## Non-goals

- Rewriting every content query to use a new shared search abstraction beyond collection search.
- Implementing PostgreSQL full-text search in this proposal unless required as a compatibility abstraction.
- Replacing the collection API surface or changing how collections declare searchable fields.
- Changing collection-level search APIs or metadata shape.

## Interfaces and compatibility

This feature is additive and should not require a breaking change in collection configuration.

Expected compatibility impact:

- No change to the public `search()` or `searchCollection()` API.
- No change to the collection metadata model (`search_config`, `searchable`, etc.).
- No change to the schema migration contract already used for search configuration.
- Adds an FTS provider selection configuration (`database` or `external`) exposed in integration config and runtime config.

The only expected compatibility boundary is runtime behavior: if a target backend lacks the required FTS primitives, the system should report a specific unsupported-backend error rather than silently returning empty results or throwing a generic SQLite-only error.

## Errors and edge cases

The implementation must handle these cases explicitly:

- Database backend reports FTS unsupported with an explicit reason.
- External provider is selected but not configured/enabled.
- External provider is selected but cannot provide a usable engine in this runtime.
- Search index rebuilds on collections with no searchable fields.
- Search config changes on a collection whose backend no longer supports the requested tokenizer or ranking primitives.
- Runtime detection of unsupported search features during the first collection-search request, not only at migration time.

The code should prefer a clear error message over silent degradation because silent mismatch is worse than an explicit unsupported backend.

## Verification

Implementation must verify the following:

- SQLite-backed collection search still works with the existing FTS5 implementation.
- Database-provider resolution correctly activates/deactivates FTS with explicit reasons.
- External-provider resolution correctly activates/deactivates FTS with explicit reasons.
- Collection indexing, reindexing, and suggestion queries continue to return the same data shape to callers.
- Unsupported providers fail with deliberate, testable error categories:
  - backend does not support FTS
  - provider not configured or not working

The test plan should cover:

- enable/disable search on a collection
- rebuild index after field changes
- search across a content table using the backend-appropriate SQL
- suggestion queries
- unsupported-backend guardrails
- external-provider guardrails

## Open questions

- Which external providers should be shipped first as first-party adapters?
- How should non-FTS5 engines map snippet/highlight/ranking behavior to the existing API response shape?
- For highlight/snippet output, should the API preserve a single normalized response shape even when each backend uses different native highlight functions?
- Should PostgreSQL support be implemented immediately or kept behind the backend abstraction as a future follow-up?
- Should external providers be loaded via static descriptor imports only, or also support runtime plugin registration?

Implementation guidance: keep provider selection capability-based and configuration-driven. Avoid hard-coded backend-name routing in manager logic; adapters and external provider descriptors should declare support and reasons directly.
