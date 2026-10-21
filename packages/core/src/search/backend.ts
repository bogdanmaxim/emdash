import type { Kysely } from "kysely";

import { detectDialect } from "../database/dialect-helpers.js";
import type { Database } from "../database/types.js";

export type SearchEngine = "fts5";

export interface DatabaseSearchProviderSelection {
	mode: "database";
}

export interface ExternalSearchProviderConfig {
	id: string;
	searchEngine?: SearchEngine;
	enabled?: boolean;
	unavailableReason?: string;
}

export interface ExternalSearchProviderSelection {
	mode: "external";
	provider: ExternalSearchProviderConfig;
}

export type SearchProviderSelection =
	| DatabaseSearchProviderSelection
	| ExternalSearchProviderSelection;

export interface SearchBackendProviderCapability {
	providerId: string;
	searchEngine: SearchEngine | null;
	available: boolean;
	reason?: string;
}

interface SearchBackendCapableAdapter {
	readonly searchBackendProvider?: SearchBackendProviderCapability;
	readonly searchBackendCapability?:
		| "sqlite-fts5"
		| "turso-unsupported"
		| "libsql-unsupported"
		| "unsupported";
	readonly searchBackendUnsupportedReason?: string;
}

export interface SearchBackendResolution {
	providerSource: "database" | "external";
	providerId: string;
	supportsSearch: boolean;
	searchEngine: SearchEngine | null;
	errorCode?: "BACKEND_UNSUPPORTED" | "PROVIDER_UNAVAILABLE";
	unavailableReason?: string;
}

const DEFAULT_POSTGRES_REASON = "not implemented for Postgres backends in this runtime";
const DEFAULT_TURSO_REASON = "not supported by the Turso backend in this runtime";
const DEFAULT_LIBSQL_REASON = "not supported by the libSQL backend in this runtime";
const DEFAULT_SQLITE_REASON = "not implemented for this SQLite-compatible backend";

const DEFAULT_EXTERNAL_NOT_CONFIGURED_REASON = "provider not configured or not enabled";
const DEFAULT_EXTERNAL_NOT_WORKING_REASON =
	"provider does not expose an FTS engine supported by this runtime";

function backendUnsupported(providerId: string, reason: string): SearchBackendResolution {
	return {
		providerSource: "database",
		providerId,
		supportsSearch: false,
		searchEngine: null,
		errorCode: "BACKEND_UNSUPPORTED",
		unavailableReason: reason,
	};
}

function providerUnavailable(providerId: string, reason: string): SearchBackendResolution {
	return {
		providerSource: "external",
		providerId,
		supportsSearch: false,
		searchEngine: null,
		errorCode: "PROVIDER_UNAVAILABLE",
		unavailableReason: reason,
	};
}

function availableProvider(
	providerSource: SearchBackendResolution["providerSource"],
	providerId: string,
	searchEngine: SearchEngine,
): SearchBackendResolution {
	return {
		providerSource,
		providerId,
		supportsSearch: true,
		searchEngine,
	};
}

function normalizeReason(reason: string | undefined, fallback: string): string {
	const trimmed = reason?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function resolveLegacyCapability(
	adapter: SearchBackendCapableAdapter,
): SearchBackendResolution | null {
	if (adapter.searchBackendCapability === "sqlite-fts5") {
		return availableProvider("database", "sqlite-fts5", "fts5");
	}
	if (adapter.searchBackendCapability === "turso-unsupported") {
		return backendUnsupported(
			"turso",
			normalizeReason(adapter.searchBackendUnsupportedReason, DEFAULT_TURSO_REASON),
		);
	}
	if (adapter.searchBackendCapability === "libsql-unsupported") {
		return backendUnsupported(
			"libsql",
			normalizeReason(adapter.searchBackendUnsupportedReason, DEFAULT_LIBSQL_REASON),
		);
	}
	if (adapter.searchBackendCapability === "unsupported") {
		return backendUnsupported(
			"sqlite-compat",
			normalizeReason(adapter.searchBackendUnsupportedReason, DEFAULT_SQLITE_REASON),
		);
	}
	return null;
}

function resolveDatabaseProvider(db: Kysely<any>): SearchBackendResolution {
	if (detectDialect(db) === "postgres") {
		return backendUnsupported("postgres", DEFAULT_POSTGRES_REASON);
	}

	const adapter = db.getExecutor().adapter as object;
	const declared = adapter as SearchBackendCapableAdapter;
	if (declared.searchBackendProvider) {
		const capability = declared.searchBackendProvider;
		if (capability.available && capability.searchEngine === "fts5") {
			return availableProvider("database", capability.providerId, "fts5");
		}
		return backendUnsupported(
			capability.providerId,
			normalizeReason(capability.reason, DEFAULT_SQLITE_REASON),
		);
	}

	const legacy = resolveLegacyCapability(declared);
	if (legacy) return legacy;

	const adapterName = adapter.constructor.name.toLowerCase();
	if (adapterName.includes("turso")) {
		return backendUnsupported("turso", DEFAULT_TURSO_REASON);
	}
	if (adapterName.includes("libsql")) {
		return backendUnsupported("libsql", DEFAULT_LIBSQL_REASON);
	}

	return availableProvider("database", "sqlite-fts5", "fts5");
}

function resolveExternalProvider(config: ExternalSearchProviderConfig): SearchBackendResolution {
	const providerId = config.id;
	if (config.enabled !== true) {
		return providerUnavailable(
			providerId,
			normalizeReason(config.unavailableReason, DEFAULT_EXTERNAL_NOT_CONFIGURED_REASON),
		);
	}
	if (config.searchEngine !== "fts5") {
		return providerUnavailable(
			providerId,
			normalizeReason(config.unavailableReason, DEFAULT_EXTERNAL_NOT_WORKING_REASON),
		);
	}
	return availableProvider("external", providerId, "fts5");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- accepts any Kysely instance
export function resolveSearchBackend(
	db: Kysely<any>,
	selection: SearchProviderSelection = { mode: "database" },
): SearchBackendResolution {
	if (selection.mode === "external") {
		return resolveExternalProvider(selection.provider);
	}
	return resolveDatabaseProvider(db);
}

export function searchUnsupportedMessage(
	backend: SearchBackendResolution,
	operation = "search",
): string {
	if (backend.supportsSearch) {
		return "";
	}
	const reason = backend.unavailableReason;
	const reasonSuffix = reason ? ` (${reason})` : "";
	if (backend.errorCode === "BACKEND_UNSUPPORTED") {
		return `Cannot ${operation}: full-text search backend does not support FTS${reasonSuffix}`;
	}
	if (backend.errorCode === "PROVIDER_UNAVAILABLE") {
		return `Cannot ${operation}: full-text search provider is not configured or not working${reasonSuffix}`;
	}
	return `Cannot ${operation}: full-text search is not available${reasonSuffix}`;
}

export function isSearchSupported(backend: SearchBackendResolution): boolean {
	return backend.supportsSearch;
}

export function usesFts5Engine(backend: SearchBackendResolution): backend is {
	providerSource: "database" | "external";
	providerId: string;
	supportsSearch: true;
	searchEngine: SearchEngine;
} {
	return backend.supportsSearch && backend.searchEngine === "fts5";
}

export function resolveSearchBackendForDatabase(
	db: Kysely<Database>,
	selection?: SearchProviderSelection,
): SearchBackendResolution {
	return resolveSearchBackend(db, selection);
}
