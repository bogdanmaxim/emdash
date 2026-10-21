import type {
	DatabaseSearchProviderSelection,
	ExternalSearchProviderConfig,
	ExternalSearchProviderSelection,
} from "./backend.js";

export type { ExternalSearchProviderConfig };

export function databaseSearchProvider(): DatabaseSearchProviderSelection {
	return { mode: "database" };
}

export function externalSearchProvider(
	provider: ExternalSearchProviderConfig,
): ExternalSearchProviderSelection {
	return { mode: "external", provider };
}
