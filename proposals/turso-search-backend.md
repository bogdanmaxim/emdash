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

Add backend-aware full-text search support so each database engine chooses the correct index and query strategy.

The intended runtime behavior is:

- SQLite remains the default FTS5-capable backend and keeps the current implementation.
- libSQL uses the SQLite FTS5 path by default while the libSQL runtime still supports the FTS5 primitives EmDash relies on.
- If the target deployment is a newer Turso engine or server product that no longer exposes the same SQLite FTS5 semantics, EmDash should switch to the Turso-native backend instead of assuming FTS5 is available.
- PostgreSQL is handled through a separate future backend, without changing the collection search API.

The collection-level API remains stable: collections keep the same searchable-field metadata and search configuration, while the backend-specific implementation is hidden behind the search manager abstraction.

Important nuance: official libSQL docs and repo guidance still describe libSQL as a SQLite-compatible fork with FTS5 support, while the Turso Database product moved to a separate native FTS implementation in newer server/engine versions. This means the correct decision is capability-based, not a blanket "all libSQL equals SQLite" rule. We should default to the FTS5 path for libSQL when present, but allow the engine to opt into the newer Turso backend when the runtime no longer exposes the legacy SQLite FTS5 features.

## Goals

- Support backend-specific full-text search implementations without changing collection schema or public APIs.
- Preserve the existing SQLite FTS5 implementation as the reference backend.
- Allow libSQL/Turso deployments to use collection search when their engine supports the required capabilities.
- Fail explicitly and clearly when a backend does not support the required full-text index features.
- Keep code paths for search configuration, indexing, and query execution isolated by database backend.

## Non-goals

- Rewriting every content query to use a new shared search abstraction beyond collection search.
- Implementing PostgreSQL full-text search in this proposal unless required as a compatibility abstraction.
- Replacing the collection API surface or changing how collections declare searchable fields.
- Introducing a new public search configuration format without a separate compatibility decision.

## Interfaces and compatibility

This feature is additive and should not require a breaking change in collection configuration.

Expected compatibility impact:

- No change to the public `search()` or `searchCollection()` API.
- No change to the collection metadata model (`search_config`, `searchable`, etc.).
- No change to the schema migration contract already used for search configuration.
- The backend selection logic becomes internal to the search manager and adapter stack.

The only expected compatibility boundary is runtime behavior: if a target backend lacks the required FTS primitives, the system should report a specific unsupported-backend error rather than silently returning empty results or throwing a generic SQLite-only error.

## Errors and edge cases

The implementation must handle these cases explicitly:

- SQLite FTS5 not available or not enabled on a given runtime.
- libSQL runtime that supports only a subset of SQLite FTS5 features.
- Turso FTS primitives that differ from SQLite FTS5 functions and tokenizer behavior.
- Search index rebuilds on collections with no searchable fields.
- Search config changes on a collection whose backend no longer supports the requested tokenizer or ranking primitives.
- Runtime detection of unsupported search features during the first collection-search request, not only at migration time.

The code should prefer a clear error message over silent degradation because silent mismatch is worse than an explicit unsupported backend.

## Verification

Implementation must verify the following:

- SQLite-backed collection search still works with the existing FTS5 implementation.
- libSQL-backed collection search continues to work when the runtime supports the same FTS5 semantics.
- Turso-backed collection search routes to Turso-native FTS logic and does not call SQLite FTS5 functions blindly.
- Collection indexing, reindexing, and suggestion queries continue to return the same data shape to callers.
- Unsupported backends fail with a deliberate, testable error instead of falling through to SQLite-only logic.

The test plan should cover:

- enable/disable search on a collection
- rebuild index after field changes
- search across a content table using the backend-appropriate SQL
- suggestion queries
- unsupported-backend guardrails

## Open questions

- Which Turso FTS primitives are available in the runtime target used by EmDash deployments?
- Should libSQL/Turso support include rough compatibility with the existing SQLite FTS5 API surface, or should the backend-specific query layer diverge more aggressively?
- For highlight/snippet output, should the API preserve a single normalized response shape even when each backend uses different native highlight functions?
- Should PostgreSQL support be implemented immediately or kept behind the backend abstraction as a future follow-up?
- Is the runtime a libSQL fork, a Turso server/engine, or a newer Turso deployment that has moved past SQLite FTS5 compatibility? This should be detected by capability, not by hard-coded version assumptions.

The strongest implementation guidance is to treat the cutoff as capability-based, not version-based. The public docs we have suggest that libSQL still supports FTS5, while newer Turso engine deployments shifted to a native FTS implementation around 2025-2026. There is no single published libSQL version number that cleanly marks the "stop supporting FTS5" line, so feature detection is the correct strategy.

These questions should be resolved during implementation with explicit backend capability checks and tests, rather than by making assumptions about SQL feature parity.
