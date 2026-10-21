/**
 * libSQL runtime adapter
 *
 * Creates a Kysely dialect for libSQL/Turso.
 * Loaded at runtime via virtual module.
 */

import { LibsqlDialect } from "@libsql/kysely-libsql";
import type { Dialect } from "kysely";

import { DEFAULT_TURSO_REASON } from "../search/provider-reasons.js";
import type { LibsqlConfig } from "./adapters.js";

function createCapabilityAwareLibsqlDialect(config: LibsqlConfig): Dialect {
	const isTurso = config.url.startsWith("libsql://");

	return new (class extends LibsqlDialect {
		override createAdapter() {
			const adapter = super.createAdapter();
			Object.defineProperty(adapter, "searchProviders", {
				value: isTurso
					? [
							{
								id: "turso",
								searchEngines: [],
								available: false,
								reason: DEFAULT_TURSO_REASON,
								capabilities: ["text", "ranking", "snippet", "highlights"],
							},
							{
								id: "sqlite-fts5",
								searchEngines: [],
								available: false,
								reason: DEFAULT_TURSO_REASON,
								capabilities: ["text", "ranking", "snippet", "highlights"],
							},
						]
					: [
							{
								id: "libsql",
								searchEngines: ["fts5"],
								available: true,
								capabilities: ["text", "ranking", "snippet", "highlights"],
							},
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
	})({
		url: config.url,
		authToken: config.authToken,
	});
}

/**
 * Create a libSQL dialect from config
 */
export function createDialect(config: LibsqlConfig): Dialect {
	return createCapabilityAwareLibsqlDialect(config);
}
