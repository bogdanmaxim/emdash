/**
 * Search Module
 *
 * Full-text search for EmDash using SQLite FTS5.
 */

// Types
export type {
	SearchConfig,
	SearchTokenizer,
	SearchOptions,
	CollectionSearchOptions,
	SearchResult,
	SearchResponse,
	SuggestOptions,
	Suggestion,
	SearchStats,
} from "./types.js";
export { SEARCH_TOKENIZERS } from "./types.js";
export {
	searchProvider,
	databaseSearchProvider,
	externalSearchProvider,
	externalSearchProviders,
	getActiveSearchProvider,
	getActiveSearchProviderId,
	getRegisteredSearchProvider,
	getSearchProviderStatus,
	listRegisteredSearchProviders,
	providerStatus,
	registerSearchProvider,
	registerSearchProviders,
	setActiveSearchProvider,
	setSearchProviderStatus,
	unregisterSearchProvider,
	updateRegisteredSearchProvider,
	wrapDatabaseSearchProviderAsExternal,
	type DatabaseSearchProviderConfig,
	type ExternalSearchProviderConfig,
	type ExternalSearchProvidersConfig,
	type WrappedDatabaseSearchProviderConfig,
} from "./providers.js";
export type {
	SearchBackendResolution,
	SearchCapability,
	SearchEngine,
	SearchProviderHealth,
	SearchProviderCapability,
	SearchProviderDescriptor,
	SearchProviderSchema,
	SearchProviderSelection,
	SearchProviderStatus,
} from "./provider-resolution.js";
export {
	validateSearchProviderSelection,
	validateSearchProviderSelectionSafe,
} from "./provider-selection-schema.js";

// FTS Manager
export { FTSManager } from "./fts-manager.js";

// Query functions (public API uses getDb() internally)
export { search, searchWithDb, searchCollection, getSuggestions, getSearchStats } from "./query.js";

// Text extraction
export { extractPlainText, extractSearchableFields } from "./text-extraction.js";
