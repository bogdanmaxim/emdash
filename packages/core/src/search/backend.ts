import type { Kysely } from "kysely";

import { detectDialect } from "../database/dialect-helpers.js";
import type { Database } from "../database/types.js";

export type SearchBackendCapability = "sqlite-fts5" | "libsql-unsupported" | "unsupported";

interface SearchBackendCapableAdapter {
	readonly searchBackendCapability?: SearchBackendCapability;
	readonly searchBackendUnsupportedReason?: string;
}

export interface SearchBackendResolution {
	kind: "sqlite-fts5" | "libsql-unsupported" | "sqlite-unsupported" | "postgres-unsupported";
	supportsFts5: boolean;
	unsupportedMessage?: string;
}

const POSTGRES_UNSUPPORTED_MESSAGE =
	"Full-text search is only available on SQLite FTS5 backends";
const LIBSQL_UNSUPPORTED_MESSAGE =
	"Full-text search is not available on libSQL/Turso backends in this runtime";
const SQLITE_UNSUPPORTED_MESSAGE =
	"Full-text search is not available on this SQLite-compatible backend";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- accepts any Kysely instance
export function resolveSearchBackend(db: Kysely<any>): SearchBackendResolution {
	if (detectDialect(db) === "postgres") {
		return {
			kind: "postgres-unsupported",
			supportsFts5: false,
			unsupportedMessage: POSTGRES_UNSUPPORTED_MESSAGE,
		};
	}

	const adapter = db.getExecutor().adapter as object;
	const declared = adapter as SearchBackendCapableAdapter;
	if (declared.searchBackendCapability === "sqlite-fts5") {
		return { kind: "sqlite-fts5", supportsFts5: true };
	}
	if (declared.searchBackendCapability === "libsql-unsupported") {
		return {
			kind: "libsql-unsupported",
			supportsFts5: false,
			unsupportedMessage: declared.searchBackendUnsupportedReason ?? LIBSQL_UNSUPPORTED_MESSAGE,
		};
	}
	if (declared.searchBackendCapability === "unsupported") {
		return {
			kind: "sqlite-unsupported",
			supportsFts5: false,
			unsupportedMessage: declared.searchBackendUnsupportedReason ?? SQLITE_UNSUPPORTED_MESSAGE,
		};
	}

	const adapterName = adapter.constructor.name.toLowerCase();
	if (adapterName.includes("libsql")) {
		return {
			kind: "libsql-unsupported",
			supportsFts5: false,
			unsupportedMessage: LIBSQL_UNSUPPORTED_MESSAGE,
		};
	}

	return { kind: "sqlite-fts5", supportsFts5: true };
}

export function searchUnsupportedMessage(
	backend: SearchBackendResolution,
	operation = "search",
): string {
	if (backend.supportsFts5) {
		return "";
	}
	const message =
		backend.unsupportedMessage ?? "Full-text search is not available on this database backend";
	return `Cannot ${operation}: ${message}`;
}

export function isFts5SearchBackend(backend: SearchBackendResolution): backend is {
	kind: "sqlite-fts5";
	supportsFts5: true;
} {
	return backend.supportsFts5;
}

export function resolveSearchBackendForDatabase(
	db: Kysely<Database>,
): SearchBackendResolution {
	return resolveSearchBackend(db);
}
