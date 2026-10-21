import { Kysely, SqliteAdapter, SqliteDialect } from "kysely";
import { describe, expect, it, vi } from "vitest";

const virtualConfig = vi.hoisted(() => ({ default: {} as { search?: unknown } }));
vi.mock("virtual:emdash/config", () => virtualConfig);

import type { Database } from "../../../src/database/types.js";
import { resolveSearchBackend } from "../../../src/search/backend.js";
import { FTSManager } from "../../../src/search/fts-manager.js";
import { externalSearchProvider } from "../../../src/search/providers.js";

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

describe("search backend routing", () => {
	it("routes stock SQLite adapters to the database provider", () => {
		expect(resolveSearchBackend(sqliteDb())).toEqual({
			providerSource: "database",
			providerId: "sqlite-fts5",
			supportsSearch: true,
			searchEngine: "fts5",
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

	it("routes libSQL-like adapter class names to backend-unsupported", () => {
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
			providerId: "libsql",
			supportsSearch: false,
			searchEngine: null,
			errorCode: "BACKEND_UNSUPPORTED",
			unavailableReason: "not supported by the libSQL backend in this runtime",
		});
	});

	it("allows selecting an external FTS provider", () => {
		expect(
			resolveSearchBackend(
				sqliteDb(),
				externalSearchProvider({
					id: "external-fts",
					enabled: true,
					searchEngine: "fts5",
				}),
			),
		).toEqual({
			providerSource: "external",
			providerId: "external-fts",
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
	});
});
