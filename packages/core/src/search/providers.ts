import type {
	SearchEngine,
	SearchProviderHealth,
	SearchProviderStatus,
	SearchProviderDescriptor,
	SearchProviderSelection,
	SearchProviderSchema,
} from "./provider-resolution.js";

export interface DatabaseSearchProviderConfig {
	id?: string;
	engine?: SearchEngine;
	enabled?: boolean;
	unavailableReason?: string;
	schema?: SearchProviderSchema;
}

export interface ExternalSearchProviderConfig {
	id: string;
	engine?: SearchEngine;
	enabled?: boolean;
	unavailableReason?: string;
	schema?: SearchProviderSchema;
	status?: SearchProviderStatus;
}

export interface ExternalSearchProvidersConfig {
	providers: readonly ExternalSearchProviderConfig[];
	activeProviderId?: string;
}

export interface WrappedDatabaseSearchProviderConfig {
	id: string;
	engine?: SearchEngine;
	enabled?: boolean;
	unavailableReason?: string;
	schema?: SearchProviderSchema;
	config?: Record<string, unknown>;
}

export type { SearchProviderDescriptor };

const RUNTIME_SEARCH_PROVIDER_REGISTRY_KEY = Symbol.for("emdash:runtimeSearchProviders");
const ACTIVE_SEARCH_PROVIDER_KEY = Symbol.for("emdash:activeRuntimeSearchProvider");

function runtimeSearchProviderRegistry(): Map<string, SearchProviderDescriptor> {
	const holder = globalThis as Record<symbol, Map<string, SearchProviderDescriptor> | undefined>;
	const existing = holder[RUNTIME_SEARCH_PROVIDER_REGISTRY_KEY];
	if (existing) return existing;
	const created = new Map<string, SearchProviderDescriptor>();
	holder[RUNTIME_SEARCH_PROVIDER_REGISTRY_KEY] = created;
	return created;
}

function runtimeActiveSearchProviderHolder(): Record<symbol, string | undefined> {
	return globalThis;
}

export function searchProvider(provider: SearchProviderDescriptor): SearchProviderSelection {
	return { provider };
}

export function registerSearchProvider(provider: SearchProviderDescriptor): void {
	runtimeSearchProviderRegistry().set(provider.id, provider);
}

export function registerSearchProviders(providers: readonly SearchProviderDescriptor[]): void {
	for (const provider of providers) {
		registerSearchProvider(provider);
	}
}

export function unregisterSearchProvider(id: string): void {
	runtimeSearchProviderRegistry().delete(id);
}

export function getRegisteredSearchProvider(id: string): SearchProviderDescriptor | undefined {
	return runtimeSearchProviderRegistry().get(id);
}

export function listRegisteredSearchProviders(): SearchProviderDescriptor[] {
	return [...runtimeSearchProviderRegistry().values()];
}

export function updateRegisteredSearchProvider(
	id: string,
	patch: Partial<SearchProviderDescriptor>,
): SearchProviderDescriptor | undefined {
	const registry = runtimeSearchProviderRegistry();
	const current = registry.get(id);
	if (!current) return undefined;
	const updated = {
		...current,
		...patch,
		id: current.id,
		source: patch.source ?? current.source,
		schema: patch.schema ?? current.schema,
		status: patch.status ?? current.status,
	} satisfies SearchProviderDescriptor;
	registry.set(id, updated);
	return updated;
}

export function setActiveSearchProvider(id: string | null): void {
	const holder = runtimeActiveSearchProviderHolder();
	if (id === null) {
		delete holder[ACTIVE_SEARCH_PROVIDER_KEY];
		return;
	}
	holder[ACTIVE_SEARCH_PROVIDER_KEY] = id;
}

export function getActiveSearchProviderId(): string | undefined {
	return runtimeActiveSearchProviderHolder()[ACTIVE_SEARCH_PROVIDER_KEY];
}

export function getActiveSearchProvider(): SearchProviderDescriptor | undefined {
	const activeProviderId = getActiveSearchProviderId();
	if (!activeProviderId) return undefined;
	return getRegisteredSearchProvider(activeProviderId);
}

export function setSearchProviderStatus(
	id: string,
	status: SearchProviderStatus,
): SearchProviderDescriptor | undefined {
	return updateRegisteredSearchProvider(id, { status });
}

export function getSearchProviderStatus(id: string): SearchProviderStatus | undefined {
	return getRegisteredSearchProvider(id)?.status;
}

export function providerStatus(
	health: SearchProviderHealth,
	status: Omit<SearchProviderStatus, "health"> = {},
): SearchProviderStatus {
	return { health, ...status };
}

export function databaseSearchProvider(
	config: DatabaseSearchProviderConfig = {},
): SearchProviderSelection {
	return {
		provider: {
			id: config.id ?? "database",
			source: "database",
			engine: config.engine,
			enabled: config.enabled,
			unavailableReason: config.unavailableReason,
			schema: config.schema,
		},
	};
}

export function externalSearchProvider(
	config: ExternalSearchProviderConfig,
): SearchProviderSelection {
	return {
		provider: {
			id: config.id,
			source: "external",
			engine: config.engine,
			enabled: config.enabled,
			unavailableReason: config.unavailableReason,
			schema: config.schema,
			status: config.status,
		},
	};
}

export function externalSearchProviders(
	config: ExternalSearchProvidersConfig,
): SearchProviderSelection {
	return {
		externalProviders: config.providers.map((provider) => ({
			id: provider.id,
			source: "external",
			engine: provider.engine,
			enabled: provider.enabled,
			unavailableReason: provider.unavailableReason,
			schema: provider.schema,
			status: provider.status,
		})),
		activeProviderId: config.activeProviderId,
	};
}

export function wrapDatabaseSearchProviderAsExternal(
	config: WrappedDatabaseSearchProviderConfig,
): SearchProviderSelection {
	return {
		provider: {
			id: config.id,
			source: "external",
			engine: config.engine,
			enabled: config.enabled,
			unavailableReason: config.unavailableReason,
			schema: config.schema ?? { name: config.id, config: config.config },
		},
	};
}
