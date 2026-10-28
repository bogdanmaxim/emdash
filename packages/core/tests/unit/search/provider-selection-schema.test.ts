import { describe, expect, it } from "vitest";

import {
	validateSearchProviderSelection,
	validateSearchProviderSelectionSafe,
} from "../../../src/search/provider-selection-schema.js";

describe("search provider selection schema", () => {
	it("accepts empty selection", () => {
		expect(validateSearchProviderSelection({})).toEqual({});
	});

	it("accepts multi-external selection with matching active provider", () => {
		const selection = validateSearchProviderSelection({
			externalProviders: [
				{ id: "external-a", source: "external", enabled: true, engine: "fts5" },
				{ id: "external-b", source: "external", enabled: true, engine: "fts5" },
			],
			activeProviderId: "external-b",
		});
		expect(selection.activeProviderId).toBe("external-b");
	});

	it("rejects active provider mismatch", () => {
		expect(() =>
			validateSearchProviderSelection({
				externalProviders: [{ id: "external-a", enabled: true, engine: "fts5" }],
				activeProviderId: "external-b",
			}),
		).toThrow();
	});

	it("rejects combining database provider with externalProviders", () => {
		expect(() =>
			validateSearchProviderSelection({
				provider: { id: "sqlite-fts5", source: "database" },
				externalProviders: [{ id: "external-a", enabled: true, engine: "fts5" }],
			}),
		).toThrow();
	});

	it("returns safe validation errors", () => {
		const result = validateSearchProviderSelectionSafe({
			activeProviderId: "external-a",
		});
		expect(result.success).toBe(false);
		expect(result.errors?.[0]).toContain("activeProviderId");
	});
});
