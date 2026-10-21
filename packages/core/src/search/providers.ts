import type {
	SearchEngine,
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

export function searchProvider(provider: SearchProviderDescriptor): SearchProviderSelection {
	return { provider };
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
		},
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
