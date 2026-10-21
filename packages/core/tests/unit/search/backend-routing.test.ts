import { Kysely, SqliteAdapter, SqliteDialect } from "kysely";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "../../../src/database/types.js";
import { resolveSearchBackend } from "../../../src/search/backend.js";
import { FTSManager } from "../../../src/search/fts-manager.js";

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
	it("routes stock SQLite adapters to the sqlite-fts5 backend", () => {
		expect(resolveSearchBackend(sqliteDb())).toEqual({
			kind: "sqlite-fts5",
			supportsSearch: true,
			searchEngine: "fts5",
		});
	});

	it("routes adapters that declare Turso capability to explicit unsupported backend", () => {
		expect(
			resolveSearchBackend(
				sqliteDbWithCapability(
					"turso-unsupported",
					"Full-text search is not available on Turso backends in this runtime",
				),
			),
		).toEqual({
			kind: "turso-unsupported",
			supportsSearch: false,
			searchEngine: null,
			unsupportedMessage: "Full-text search is not available on Turso backends in this runtime",
		});
	});

	it("routes libSQL-like adapter class names to explicit unsupported backend", () => {
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
			kind: "libsql-unsupported",
			supportsSearch: false,
			searchEngine: null,
			unsupportedMessage: "Full-text search is not available on libSQL backends in this runtime",
		});
	});

	it("keeps unsupported backends out of SQLite FTS paths", async () => {
		const db = sqliteDbWithCapability(
			"turso-unsupported",
			"Full-text search is not available on Turso backends in this runtime",
		);
		const executeQuery = vi.spyOn(db.getExecutor(), "executeQuery");
		const fts = new FTSManager(db);

		await expect(fts.getSearchMetadata()).resolves.toEqual(new Map());
		expect(executeQuery).not.toHaveBeenCalled();
		expect(fts.isSearchSupported()).toBe(false);
		await expect(fts.enableSearch("articles")).rejects.toThrow(
			"Cannot enable full-text search: Full-text search is not available on Turso backends in this runtime",
		);
	});
});
