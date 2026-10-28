/**
 * SQLite runtime adapter
 *
 * Creates a Kysely dialect for Node's built-in SQLite driver.
 * Loaded at runtime via virtual module.
 */

import { type Dialect, SqliteDialect } from "kysely";

import type { SqliteConfig } from "./adapters.js";
import { openNodeSqliteDatabase } from "./node-sqlite-compat.js";

/**
 * Create a SQLite dialect from config
 */
export function createDialect(config: SqliteConfig): Dialect {
	// Parse URL to get file path
	const url = config.url;
	const filePath = url.startsWith("file:") ? url.slice(5) : url;

	const database = openNodeSqliteDatabase(filePath, { journalMode: "wal" });

	return new (class extends SqliteDialect {
		override createAdapter() {
			const adapter = super.createAdapter();
			Object.defineProperty(adapter, "searchProviders", {
				value: [
					{
						id: "sqlite-fts5",
						searchEngines: ["fts5"],
						available: true,
						capabilities: ["text", "ranking", "snippet", "highlights"],
					},
				],
				enumerable: true,
				configurable: true,
				writable: true,
			});
			return adapter;
		}
	})({ database });
}
