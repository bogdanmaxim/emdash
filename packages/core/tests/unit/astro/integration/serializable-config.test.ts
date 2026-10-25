import { describe, expect, it } from "vitest";

import { buildSerializableConfig, emdash } from "../../../../src/astro/integration/index.js";
import {
	externalSearchProvider,
	externalSearchProviders,
} from "../../../../src/search/providers.js";

describe("buildSerializableConfig", () => {
	it("passes the update-check opt-out to the runtime config", () => {
		expect(buildSerializableConfig({ updateCheck: false }).updateCheck).toBe(false);
	});

	it("passes the search provider selection to the runtime config", () => {
		const search = externalSearchProvider({
			id: "external-fts",
			enabled: true,
			engine: "fts5",
		});
		expect(buildSerializableConfig({ search }).search).toEqual(search);
	});

	it("passes multi-provider search selection to the runtime config", () => {
		const search = externalSearchProviders({
			activeProviderId: "external-b",
			providers: [
				{ id: "external-a", enabled: true, engine: "fts5" },
				{ id: "external-b", enabled: true, engine: "fts5" },
			],
		});
		expect(buildSerializableConfig({ search }).search).toEqual(search);
	});

	it("rejects invalid search provider selection", () => {
		expect(() =>
			buildSerializableConfig({
				search: {
					externalProviders: [{ id: "external-a", enabled: true, engine: "fts5" }],
					activeProviderId: "external-b",
				},
			}),
		).toThrow();
	});
});

describe("updateCheck option", () => {
	it("rejects an invalid minimum release age during integration setup", () => {
		expect(() => emdash({ updateCheck: { minimumReleaseAge: "soon" } })).toThrow(
			/updateCheck\.minimumReleaseAge.*soon/,
		);
		expect(() => emdash({ updateCheck: { minimumReleaseAge: "48h" } })).not.toThrow();
	});
});
