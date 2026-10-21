import type { Kysely } from "kysely";

import { detectDialect } from "../database/dialect-helpers.js";
import { DEFAULT_LIBSQL_REASON, DEFAULT_TURSO_REASON } from "./provider-reasons.js";
import { getRegisteredSearchProvider } from "./providers.js";

export type SearchEngine = "fts5" | "typegraph" | "postgres-lexical";
export type SearchCapability =
	| "text"
	| "ranking"
	| "snippet"
	| "highlights"
	| "references"
	| "vector"
	| "graph";

export interface SearchProviderSchema {
	readonly name: string;
	readonly config?: Record<string, unknown>;
}

export interface SearchProviderCapability {
	readonly id: string;
	readonly searchEngines: readonly SearchEngine[];
	readonly available: boolean;
	readonly reason?: string;
	readonly schema?: SearchProviderSchema;
	readonly capabilities?: readonly SearchCapability[];
}

export interface SearchProviderDescriptor {
	readonly id: string;
	readonly source?: "database" | "external";
	readonly enabled?: boolean;
	readonly engine?: SearchEngine;
	readonly unavailableReason?: string;
	readonly schema?: SearchProviderSchema;
	readonly capabilities?: readonly SearchCapability[];
}

export interface SearchProviderSelection {
	readonly provider?: SearchProviderDescriptor;
}

interface SearchProviderCapableAdapter {
	readonly searchProviders?: readonly SearchProviderCapability[];
	readonly searchBackendProvider?: {
		readonly providerId: string;
		readonly searchEngine: SearchEngine | null;
		readonly available: boolean;
		readonly reason?: string;
	};
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
	capabilities?: readonly SearchCapability[];
	errorCode?: "BACKEND_UNSUPPORTED" | "PROVIDER_UNAVAILABLE";
	unavailableReason?: string;
}

const DEFAULT_POSTGRES_REASON = "not implemented for Postgres backends in this runtime";
const DEFAULT_SQLITE_REASON = "not implemented for this SQLite-compatible backend";
const DEFAULT_DB_UNSUPPORTED_REASON = "database backend does not support FTS";
const DEFAULT_DB_PROVIDER_NOT_FOUND_REASON = "configured database search provider is not available";
const DEFAULT_DB_ENGINE_UNSUPPORTED_REASON =
	"configured database provider does not support the requested search engine";

const DEFAULT_EXTERNAL_NOT_CONFIGURED_REASON = "provider not configured or not enabled";
const DEFAULT_EXTERNAL_NOT_WORKING_REASON =
	"provider does not expose an FTS engine supported by this runtime";
const EXTERNAL_ENGINE_NOT_IMPLEMENTED_REASON: Record<Exclude<SearchEngine, "fts5">, string> = {
	typegraph: "typegraph engine integration is not implemented yet in this runtime",
	"postgres-lexical": "postgres-lexical external engine integration is not implemented yet",
};

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
	capabilities?: readonly SearchCapability[],
): SearchBackendResolution {
	return {
		providerSource,
		providerId,
		supportsSearch: true,
		searchEngine,
		capabilities,
	};
}

function normalizeReason(reason: string | undefined, fallback: string): string {
	const trimmed = reason?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function capabilityFromLegacy(
	adapter: SearchProviderCapableAdapter,
): SearchProviderCapability | null {
	if (adapter.searchBackendCapability === "sqlite-fts5") {
		return {
			id: "sqlite-fts5",
			searchEngines: ["fts5"],
			available: true,
			capabilities: ["text", "ranking", "snippet", "highlights"],
		};
	}
	if (adapter.searchBackendCapability === "turso-unsupported") {
		return {
			id: "turso",
			searchEngines: [],
			available: false,
			reason: normalizeReason(adapter.searchBackendUnsupportedReason, DEFAULT_TURSO_REASON),
		};
	}
	if (adapter.searchBackendCapability === "libsql-unsupported") {
		return {
			id: "libsql",
			searchEngines: [],
			available: false,
			reason: normalizeReason(adapter.searchBackendUnsupportedReason, DEFAULT_LIBSQL_REASON),
		};
	}
	if (adapter.searchBackendCapability === "unsupported") {
		return {
			id: "sqlite-compat",
			searchEngines: [],
			available: false,
			reason: normalizeReason(adapter.searchBackendUnsupportedReason, DEFAULT_SQLITE_REASON),
		};
	}
	return null;
}

function normalizeAdapterCapabilities(db: Kysely<any>): readonly SearchProviderCapability[] {
	if (detectDialect(db) === "postgres") {
		return [
			{
				id: "postgres-lexical",
				searchEngines: ["postgres-lexical"],
				available: false,
				reason: DEFAULT_POSTGRES_REASON,
				capabilities: ["text", "ranking", "snippet", "highlights"],
			},
			{
				id: "postgres-vector",
				searchEngines: [],
				available: false,
				reason: "vector search support is under research",
				capabilities: ["text", "ranking", "vector"],
			},
			{
				id: "postgres-graph",
				searchEngines: [],
				available: false,
				reason: "graph search support is under research",
				capabilities: ["text", "ranking", "graph", "references"],
			},
		];
	}

	const adapter = db.getExecutor().adapter as object;
	const declared = adapter as SearchProviderCapableAdapter;
	if (declared.searchProviders && declared.searchProviders.length > 0) {
		return declared.searchProviders;
	}
	if (declared.searchBackendProvider) {
		const capability = declared.searchBackendProvider;
		return [
			{
				id: capability.providerId,
				searchEngines: capability.searchEngine ? [capability.searchEngine] : [],
				available: capability.available,
				reason: capability.reason,
			},
		];
	}

	const legacy = capabilityFromLegacy(declared);
	if (legacy) return [legacy];

	const adapterName = adapter.constructor.name.toLowerCase();
	if (adapterName.includes("turso")) {
		return [{ id: "turso", searchEngines: [], available: false, reason: DEFAULT_TURSO_REASON }];
	}
	if (adapterName.includes("libsql")) {
		return [{ id: "libsql", searchEngines: [], available: false, reason: DEFAULT_LIBSQL_REASON }];
	}

	return [
		{
			id: "sqlite-fts5",
			searchEngines: ["fts5"],
			available: true,
			capabilities: ["text", "ranking", "snippet", "highlights"],
		},
	];
}

function resolveDatabaseProvider(
	db: Kysely<any>,
	selection?: SearchProviderSelection,
): SearchBackendResolution {
	const capabilities = normalizeAdapterCapabilities(db);
	const configured = selection?.provider;
	const configuredId = configured?.id;
	const selected =
		configuredId !== undefined
			? capabilities.find((capability) => capability.id === configuredId)
			: capabilities[0];
	if (!selected) {
		return backendUnsupported(
			configuredId ?? "database",
			normalizeReason(configured?.unavailableReason, DEFAULT_DB_PROVIDER_NOT_FOUND_REASON),
		);
	}
	if (!selected.available) {
		return backendUnsupported(
			selected.id,
			normalizeReason(selected.reason, DEFAULT_DB_UNSUPPORTED_REASON),
		);
	}

	const selectedEngine = configured?.engine ?? selected.searchEngines[0];
	if (!selectedEngine || !selected.searchEngines.includes(selectedEngine)) {
		return backendUnsupported(selected.id, DEFAULT_DB_ENGINE_UNSUPPORTED_REASON);
	}
	return availableProvider("database", selected.id, selectedEngine, selected.capabilities);
}

function resolveExternalProviderDescriptor(
	provider: SearchProviderDescriptor,
): SearchProviderDescriptor {
	const registered = getRegisteredSearchProvider(provider.id);
	if (!registered) return provider;
	return {
		...registered,
		...provider,
		schema: provider.schema ?? registered.schema,
		capabilities: provider.capabilities ?? registered.capabilities,
		engine: provider.engine ?? registered.engine,
	};
}

function resolveExternalProvider(provider: SearchProviderDescriptor): SearchBackendResolution {
	const resolved = resolveExternalProviderDescriptor(provider);
	const providerId = resolved.id;
	if (resolved.enabled !== true) {
		return providerUnavailable(
			providerId,
			normalizeReason(resolved.unavailableReason, DEFAULT_EXTERNAL_NOT_CONFIGURED_REASON),
		);
	}
	const selectedEngine = resolved.engine ?? "fts5";
	if (selectedEngine !== "fts5") {
		return providerUnavailable(
			providerId,
			EXTERNAL_ENGINE_NOT_IMPLEMENTED_REASON[selectedEngine] ?? DEFAULT_EXTERNAL_NOT_WORKING_REASON,
		);
	}
	return availableProvider("external", providerId, selectedEngine, resolved.capabilities);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- accepts any Kysely instance
export function resolveSearchBackend(
	db: Kysely<any>,
	selection: SearchProviderSelection = {},
): SearchBackendResolution {
	const provider = selection.provider;
	if (provider?.source === "external") {
		return resolveExternalProvider(provider);
	}
	return resolveDatabaseProvider(db, selection);
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
