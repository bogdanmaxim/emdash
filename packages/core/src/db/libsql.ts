/**
 * libSQL runtime adapter
 *
 * Creates a Kysely dialect for libSQL/Turso.
 * Loaded at runtime via virtual module.
 */

import { LibsqlDialect } from "@libsql/kysely-libsql";
import type { Dialect } from "kysely";

import type { LibsqlConfig } from "./adapters.js";

function createCapabilityAwareLibsqlDialect(config: LibsqlConfig): Dialect {
	const isTurso = config.url.startsWith("libsql://");

	return new (class extends LibsqlDialect {
		override createAdapter() {
			const adapter = super.createAdapter();
			Object.defineProperty(adapter, "searchProviders", {
				value: [
					{
						id: isTurso ? "turso" : "libsql",
						searchEngines: [],
						available: false,
						reason: isTurso
							? "not supported by the Turso backend in this runtime"
							: "not supported by the libSQL backend in this runtime",
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
