/**
 * libSQL runtime adapter
 *
 * Creates a Kysely dialect for libSQL/Turso.
 * Loaded at runtime via virtual module.
 */

import { LibsqlDialect } from "@libsql/kysely-libsql";
import type { Dialect, SqliteAdapter } from "kysely";

import type { LibsqlConfig } from "./adapters.js";

class EmDashLibsqlDialect extends LibsqlDialect {
	override createAdapter(): SqliteAdapter {
		const adapter = super.createAdapter() as SqliteAdapter & {
			searchBackendCapability?: string;
			searchBackendUnsupportedReason?: string;
		};
		adapter.searchBackendCapability = "libsql-unsupported";
		adapter.searchBackendUnsupportedReason =
			"Full-text search is not available on libSQL/Turso backends in this runtime";
		return adapter;
	}
}

/**
 * Create a libSQL dialect from config
 */
export function createDialect(config: LibsqlConfig): Dialect {
	return new EmDashLibsqlDialect({
		url: config.url,
		authToken: config.authToken,
	});
}
