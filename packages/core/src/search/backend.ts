import type { Kysely } from "kysely";

import { detectDialect } from "../database/dialect-helpers.js";
import type { Database } from "../database/types.js";

export type SearchBackendCapability =
	| "sqlite-fts5"
	| "turso-unsupported"
	| "libsql-unsupported"
	| "unsupported";

interface SearchBackendCapableAdapter {
	readonly searchBackendCapability?: SearchBackendCapability;
	readonly searchBackendUnsupportedReason?: string;
}

export interface SearchBackendResolution {
	kind:
		| "sqlite-fts5"
		| "turso-unsupported"
		| "libsql-unsupported"
		| "sqlite-unsupported"
		| "postgres-unsupported";
	supportsSearch: boolean;
	searchEngine: "fts5" | null;
	unsupportedMessage?: string;
}

const POSTGRES_UNSUPPORTED_MESSAGE = "Full-text search is only available on SQLite FTS5 backends";
const TURSO_UNSUPPORTED_MESSAGE =
	"Full-text search is not available on Turso backends in this runtime";
const LIBSQL_UNSUPPORTED_MESSAGE =
	"Full-text search is not available on libSQL backends in this runtime";
const SQLITE_UNSUPPORTED_MESSAGE =
	"Full-text search is not available on this SQLite-compatible backend";

const SEARCH_BACKEND_REGISTRY: Record<SearchBackendResolution["kind"], SearchBackendResolution> = {
	"sqlite-fts5": { kind: "sqlite-fts5", supportsSearch: true, searchEngine: "fts5" },
	"turso-unsupported": {
		kind: "turso-unsupported",
		supportsSearch: false,
		searchEngine: null,
		unsupportedMessage: TURSO_UNSUPPORTED_MESSAGE,
	},
	"libsql-unsupported": {
		kind: "libsql-unsupported",
		supportsSearch: false,
		searchEngine: null,
		unsupportedMessage: LIBSQL_UNSUPPORTED_MESSAGE,
	},
	"sqlite-unsupported": {
		kind: "sqlite-unsupported",
		supportsSearch: false,
		searchEngine: null,
		unsupportedMessage: SQLITE_UNSUPPORTED_MESSAGE,
	},
	"postgres-unsupported": {
		kind: "postgres-unsupported",
		supportsSearch: false,
		searchEngine: null,
		unsupportedMessage: POSTGRES_UNSUPPORTED_MESSAGE,
	},
};

function withReason(
	kind: SearchBackendResolution["kind"],
	reason?: string,
): SearchBackendResolution {
	const base = SEARCH_BACKEND_REGISTRY[kind];
	if (!reason || base.supportsSearch) return base;
	return { ...base, unsupportedMessage: reason };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- accepts any Kysely instance
export function resolveSearchBackend(db: Kysely<any>): SearchBackendResolution {
	if (detectDialect(db) === "postgres") {
		return SEARCH_BACKEND_REGISTRY["postgres-unsupported"];
	}

	const adapter = db.getExecutor().adapter as object;
	const declared = adapter as SearchBackendCapableAdapter;
	if (declared.searchBackendCapability === "sqlite-fts5") {
		return SEARCH_BACKEND_REGISTRY["sqlite-fts5"];
	}
	if (declared.searchBackendCapability === "turso-unsupported") {
		return withReason("turso-unsupported", declared.searchBackendUnsupportedReason);
	}
	if (declared.searchBackendCapability === "libsql-unsupported") {
		return withReason("libsql-unsupported", declared.searchBackendUnsupportedReason);
	}
	if (declared.searchBackendCapability === "unsupported") {
		return withReason("sqlite-unsupported", declared.searchBackendUnsupportedReason);
	}

	const adapterName = adapter.constructor.name.toLowerCase();
	if (adapterName.includes("turso")) {
		return SEARCH_BACKEND_REGISTRY["turso-unsupported"];
	}
	if (adapterName.includes("libsql")) return SEARCH_BACKEND_REGISTRY["libsql-unsupported"];

	return SEARCH_BACKEND_REGISTRY["sqlite-fts5"];
}

export function searchUnsupportedMessage(
	backend: SearchBackendResolution,
	operation = "search",
): string {
	if (backend.supportsSearch) {
		return "";
	}
	const message =
		backend.unsupportedMessage ?? "Full-text search is not available on this database backend";
	return `Cannot ${operation}: ${message}`;
}

export function isSearchSupported(backend: SearchBackendResolution): boolean {
	return backend.supportsSearch;
}

export function usesFts5Engine(backend: SearchBackendResolution): backend is {
	kind: "sqlite-fts5";
	supportsSearch: true;
	searchEngine: "fts5";
} {
	return backend.searchEngine === "fts5";
}

export function resolveSearchBackendForDatabase(db: Kysely<Database>): SearchBackendResolution {
	return resolveSearchBackend(db);
}
