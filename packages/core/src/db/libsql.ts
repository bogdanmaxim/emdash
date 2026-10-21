/**
 * libSQL runtime adapter
 *
 * Creates a Kysely dialect for libSQL/Turso.
 * Loaded at runtime via virtual module.
 */

import { LibsqlDialect } from "@libsql/kysely-libsql";
import type { Dialect, SqliteAdapter } from "kysely";

import type { LibsqlConfig } from "./adapters.js";

function createCapabilityAwareLibsqlDialect(config: LibsqlConfig): Dialect {
	const isTurso = config.url.startsWith("libsql://");

	return new (class extends LibsqlDialect {
		override createAdapter(): SqliteAdapter {
			const adapter = super.createAdapter() as SqliteAdapter & {
				searchBackendCapability?: "libsql-unsupported" | "turso-unsupported";
				searchBackendUnsupportedReason?: string;
			};
			adapter.searchBackendCapability = isTurso ? "turso-unsupported" : "libsql-unsupported";
			adapter.searchBackendUnsupportedReason = isTurso
				? "Full-text search is not available on Turso backends in this runtime"
				: "Full-text search is not available on libSQL backends in this runtime";
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
