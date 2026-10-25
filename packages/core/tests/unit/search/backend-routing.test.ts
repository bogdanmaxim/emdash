import { Kysely, SqliteAdapter, SqliteDialect } from "kysely";
import { beforeEach, describe, expect, it, vi } from "vitest";

const virtualConfig = vi.hoisted(() => ({ default: {} as { search?: unknown } }));
vi.mock("virtual:emdash/config", () => virtualConfig);

import type { Database } from "../../../src/database/types.js";
import { resolveSearchBackend } from "../../../src/search/backend.js";
import { FTSManager } from "../../../src/search/fts-manager.js";
import type { SearchProviderCapability } from "../../../src/search/provider-resolution.js";
import {
	databaseSearchProvider,
	externalSearchProvider,
	externalSearchProviders,
	getActiveSearchProviderId,
	getRegisteredSearchProvider,
	getSearchProviderStatus,
	listRegisteredSearchProviders,
	providerStatus,
	registerSearchProvider,
	setActiveSearchProvider,
	setSearchProviderStatus,
	unregisterSearchProvider,
	updateRegisteredSearchProvider,
	wrapDatabaseSearchProviderAsExternal,
} from "../../../src/search/providers.js";
import { getSearchStats, getSuggestions, searchWithDb } from "../../../src/search/query.js";

function sqliteDb(): Kysely<Database> {
	return new Kysely<Database>({ dialect: new SqliteDialect({ database: {} as never }) });
}

function sqliteDbWithCapability(capability: string, reason?: string): Kysely<Database> {
	class CapabilityAdapter extends SqliteAdapter {
		readonly searchBackendCapability = capability;
		readonly searchBackendUnsupportedReason = reason;
	}
	class CapabilityDialect extends SqliteDialect {
		override createAdapter(): SqliteAdapter {
			return new CapabilityAdapter();
		}
	}
	return new Kysely<Database>({ dialect: new CapabilityDialect({ database: {} as never }) });
}

function sqliteDbWithProviders(providers: readonly SearchProviderCapability[]): Kysely<Database> {
	class ProvidersAdapter extends SqliteAdapter {
		readonly searchProviders = providers;
	}
	class ProvidersDialect extends SqliteDialect {
		override createAdapter(): SqliteAdapter {
			return new ProvidersAdapter();
		}
	}
	return new Kysely<Database>({ dialect: new ProvidersDialect({ database: {} as never }) });
}

describe("search backend routing", () => {
	beforeEach(() => {
		for (const provider of listRegisteredSearchProviders()) {
			unregisterSearchProvider(provider.id);
		}
		setActiveSearchProvider(null);
	});

	it("routes stock SQLite adapters to the database provider", () => {
		expect(resolveSearchBackend(sqliteDb())).toEqual({
			providerSource: "database",
			providerId: "sqlite-fts5",
			supportsSearch: true,
			searchEngine: "fts5",
			capabilities: ["text", "ranking", "snippet", "highlights"],
		});
	});

	it("supports selecting a configured database provider id", () => {
		const db = sqliteDbWithProviders([
			{ id: "sqlite-default", available: true, searchEngines: ["fts5"] },
			{ id: "sqlite-alt", available: true, searchEngines: ["fts5"] },
		]);
		expect(resolveSearchBackend(db, databaseSearchProvider({ id: "sqlite-alt" }))).toEqual({
			providerSource: "database",
			providerId: "sqlite-alt",
			supportsSearch: true,
			searchEngine: "fts5",
		});
	});

	it("treats default database selection helper as auto-select", () => {
		const db = sqliteDbWithProviders([
			{ id: "sqlite-default", available: true, searchEngines: ["fts5"] },
			{ id: "sqlite-alt", available: true, searchEngines: ["fts5"] },
		]);
		expect(resolveSearchBackend(db, databaseSearchProvider())).toEqual({
			providerSource: "database",
			providerId: "sqlite-default",
			supportsSearch: true,
			searchEngine: "fts5",
		});
	});

	it("prefers an explicitly marked default database provider when multiple are available", () => {
		const db = sqliteDbWithProviders([
			{ id: "sqlite-default", available: true, searchEngines: ["fts5"] },
			{ id: "sqlite-alt", available: true, searchEngines: ["fts5"], default: true },
		]);
		expect(resolveSearchBackend(db)).toEqual({
			providerSource: "database",
			providerId: "sqlite-alt",
			supportsSearch: true,
			searchEngine: "fts5",
		});
	});

	it("fails closed when configured database provider id is missing", () => {
		const db = sqliteDbWithProviders([{ id: "libsql", available: true, searchEngines: ["fts5"] }]);
		expect(resolveSearchBackend(db, databaseSearchProvider({ id: "sqlite-fts5" }))).toEqual({
			providerSource: "database",
			providerId: "sqlite-fts5",
			supportsSearch: false,
			searchEngine: null,
			errorCode: "BACKEND_UNSUPPORTED",
			unavailableReason: "configured database search provider is not available",
		});
	});

	it("supports runtime-registered external providers", () => {
		unregisterSearchProvider("runtime-typegraph");
		registerSearchProvider({
			id: "runtime-typegraph",
			source: "external",
			enabled: true,
			engine: "fts5",
			capabilities: ["text", "ranking", "references"],
			schema: { name: "typegraph", config: { endpoint: "http://localhost:9000" } },
		});
		expect(
			resolveSearchBackend(
				sqliteDb(),
				externalSearchProvider({
					id: "runtime-typegraph",
					enabled: true,
				}),
			),
		).toEqual({
			providerSource: "external",
			providerId: "runtime-typegraph",
			supportsSearch: true,
			searchEngine: "fts5",
			capabilities: ["text", "ranking", "references"],
		});
		expect(getRegisteredSearchProvider("runtime-typegraph")).toBeDefined();
		expect(
			listRegisteredSearchProviders().some((provider) => provider.id === "runtime-typegraph"),
		).toBe(true);
		unregisterSearchProvider("runtime-typegraph");
		expect(getRegisteredSearchProvider("runtime-typegraph")).toBeUndefined();
	});

	it("supports runtime provider status and active-provider state updates", () => {
		registerSearchProvider({
			id: "runtime-typegraph",
			source: "external",
			enabled: false,
			engine: "fts5",
		});
		expect(getActiveSearchProviderId()).toBeUndefined();
		setActiveSearchProvider("runtime-typegraph");
		expect(getActiveSearchProviderId()).toBe("runtime-typegraph");

		updateRegisteredSearchProvider("runtime-typegraph", { enabled: true });
		setSearchProviderStatus(
			"runtime-typegraph",
			providerStatus("up", {
				checkedAt: "2026-10-25T00:00:00.000Z",
				lastSuccessAt: "2026-10-25T00:00:00.000Z",
			}),
		);
		expect(getSearchProviderStatus("runtime-typegraph")).toEqual({
			health: "up",
			checkedAt: "2026-10-25T00:00:00.000Z",
			lastSuccessAt: "2026-10-25T00:00:00.000Z",
		});
	});

	it("supports switching between multiple external providers", () => {
		expect(
			resolveSearchBackend(
				sqliteDb(),
				externalSearchProviders({
					activeProviderId: "external-b",
					providers: [
						{ id: "external-a", enabled: true, engine: "fts5" },
						{ id: "external-b", enabled: true, engine: "fts5" },
					],
				}),
			),
		).toEqual({
			providerSource: "external",
			providerId: "external-b",
			supportsSearch: true,
			searchEngine: "fts5",
		});
	});

	it("fails closed when multiple external providers are enabled without an active provider", () => {
		expect(
			resolveSearchBackend(
				sqliteDb(),
				externalSearchProviders({
					providers: [
						{ id: "external-a", enabled: true, engine: "fts5" },
						{ id: "external-b", enabled: true, engine: "fts5" },
					],
				}),
			),
		).toEqual({
			providerSource: "external",
			providerId: "external",
			supportsSearch: false,
			searchEngine: null,
			errorCode: "PROVIDER_UNAVAILABLE",
			unavailableReason:
				"multiple external search providers are enabled; configure an activeProviderId",
		});
	});

	it("routes adapters that declare Turso capability to backend-unsupported", () => {
		expect(
			resolveSearchBackend(
				sqliteDbWithCapability(
					"turso-unsupported",
					"not supported by the Turso backend in this runtime",
				),
			),
		).toEqual({
			providerSource: "database",
			providerId: "turso",
			supportsSearch: false,
			searchEngine: null,
			errorCode: "BACKEND_UNSUPPORTED",
			unavailableReason: "not supported by the Turso backend in this runtime",
		});
	});

	it("fails closed for adapters without declared capabilities", () => {
		class LibsqlLikeAdapter extends SqliteAdapter {}
		class LibsqlLikeDialect extends SqliteDialect {
			override createAdapter(): SqliteAdapter {
				return new LibsqlLikeAdapter();
			}
		}
		expect(
			resolveSearchBackend(
				new Kysely<Database>({
					dialect: new LibsqlLikeDialect({ database: {} as never }),
				}),
			),
		).toEqual({
			providerSource: "database",
			providerId: "database",
			supportsSearch: false,
			searchEngine: null,
			errorCode: "BACKEND_UNSUPPORTED",
			unavailableReason: "database backend does not support FTS",
		});
	});

	it("allows selecting an external FTS provider", () => {
		expect(
			resolveSearchBackend(
				sqliteDb(),
				externalSearchProvider({
					id: "external-fts",
					enabled: true,
					engine: "fts5",
				}),
			),
		).toEqual({
			providerSource: "external",
			providerId: "external-fts",
			supportsSearch: true,
			searchEngine: "fts5",
		});
	});

	it("defaults enabled external providers to fts5 when engine is not specified", () => {
		expect(
			resolveSearchBackend(
				sqliteDb(),
				externalSearchProvider({
					id: "external-fts-default",
					enabled: true,
				}),
			),
		).toEqual({
			providerSource: "external",
			providerId: "external-fts-default",
			supportsSearch: true,
			searchEngine: "fts5",
		});
	});

	it("returns provider-unavailable when external FTS is not configured", () => {
		expect(
			resolveSearchBackend(
				sqliteDb(),
				externalSearchProvider({
					id: "external-fts",
				}),
			),
		).toEqual({
			providerSource: "external",
			providerId: "external-fts",
			supportsSearch: false,
			searchEngine: null,
			errorCode: "PROVIDER_UNAVAILABLE",
			unavailableReason: "provider not configured or not enabled",
		});
	});

	it("returns provider-unavailable for unsupported non-fts5 external engines", () => {
		expect(
			resolveSearchBackend(
				sqliteDb(),
				externalSearchProvider({
					id: "external-typegraph",
					enabled: true,
					engine: "typegraph",
				}),
			),
		).toEqual({
			providerSource: "external",
			providerId: "external-typegraph",
			supportsSearch: false,
			searchEngine: null,
			errorCode: "PROVIDER_UNAVAILABLE",
			unavailableReason: "typegraph engine integration is not implemented yet in this runtime",
		});
	});

	it("keeps unsupported backends out of SQLite FTS paths", async () => {
		virtualConfig.default = {};
		const db = sqliteDbWithCapability(
			"turso-unsupported",
			"not supported by the Turso backend in this runtime",
		);
		const executeQuery = vi.spyOn(db.getExecutor(), "executeQuery");
		const fts = new FTSManager(db);

		await expect(fts.getSearchMetadata()).resolves.toEqual(new Map());
		expect(executeQuery).not.toHaveBeenCalled();
		expect(fts.isSearchSupported()).toBe(false);
		await expect(fts.enableSearch("articles")).rejects.toThrow(
			"Cannot enable full-text search: full-text search backend does not support FTS (not supported by the Turso backend in this runtime)",
		);
		await expect(searchWithDb(db, "search")).rejects.toThrow(
			"Cannot search: full-text search backend does not support FTS (not supported by the Turso backend in this runtime)",
		);
		await expect(getSuggestions(db, "sea")).rejects.toThrow(
			"Cannot suggest search terms: full-text search backend does not support FTS (not supported by the Turso backend in this runtime)",
		);
		await expect(getSearchStats(db)).rejects.toThrow(
			"Cannot read search statistics: full-text search backend does not support FTS (not supported by the Turso backend in this runtime)",
		);
	});

	it("keeps provider-unavailable external backends out of SQLite FTS paths", async () => {
		virtualConfig.default = {
			search: externalSearchProvider({
				id: "external-fts",
				enabled: false,
				unavailableReason: "provider not configured",
			}),
		};
		const db = sqliteDb();
		const executeQuery = vi.spyOn(db.getExecutor(), "executeQuery");
		const fts = new FTSManager(db);

		await expect(fts.getSearchMetadata()).resolves.toEqual(new Map());
		expect(executeQuery).not.toHaveBeenCalled();
		expect(fts.isSearchSupported()).toBe(false);
		await expect(fts.enableSearch("articles")).rejects.toThrow(
			"Cannot enable full-text search: full-text search provider is not configured or not working (provider not configured)",
		);
		await expect(searchWithDb(db, "search")).rejects.toThrow(
			"Cannot search: full-text search provider is not configured or not working (provider not configured)",
		);
		await expect(getSuggestions(db, "sea")).rejects.toThrow(
			"Cannot suggest search terms: full-text search provider is not configured or not working (provider not configured)",
		);
		await expect(getSearchStats(db)).rejects.toThrow(
			"Cannot read search statistics: full-text search provider is not configured or not working (provider not configured)",
		);
	});

	it("allows wrapping a database managed provider as external provider", () => {
		expect(
			resolveSearchBackend(
				sqliteDb(),
				wrapDatabaseSearchProviderAsExternal({
					id: "wrapped-db-provider",
					enabled: true,
					engine: "fts5",
					config: { url: "file:wrapped.db" },
				}),
			),
		).toEqual({
			providerSource: "external",
			providerId: "wrapped-db-provider",
			supportsSearch: true,
			searchEngine: "fts5",
		});
	});
});
