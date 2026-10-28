import { z } from "zod";

import type { SearchProviderSelection } from "./provider-resolution.js";

const searchEngineSchema = z.enum(["fts5", "typegraph", "postgres-lexical"]);
const searchProviderHealthSchema = z.enum(["up", "down", "degraded", "lagging", "indexing"]);

const searchProviderStatusSchema = z
	.object({
		health: searchProviderHealthSchema,
		checkedAt: z.string().optional(),
		lastSuccessAt: z.string().optional(),
		lastErrorAt: z.string().optional(),
		lastError: z.string().optional(),
		lagMs: z.number().int().nonnegative().optional(),
	})
	.strict();

const searchProviderSchema = z
	.object({
		id: z.string().min(1),
		source: z.enum(["database", "external"]).optional(),
		enabled: z.boolean().optional(),
		engine: searchEngineSchema.optional(),
		unavailableReason: z.string().optional(),
		schema: z
			.object({
				name: z.string().min(1),
				config: z.record(z.string(), z.unknown()).optional(),
			})
			.strict()
			.optional(),
		capabilities: z
			.array(z.enum(["text", "ranking", "snippet", "highlights", "references", "vector", "graph"]))
			.optional(),
		status: searchProviderStatusSchema.optional(),
	})
	.strict();

const searchProviderSelectionSchema = z
	.object({
		provider: searchProviderSchema.optional(),
		externalProviders: z.array(searchProviderSchema).optional(),
		activeProviderId: z.string().min(1).optional(),
	})
	.strict()
	.superRefine((value, ctx) => {
		if (value.provider?.source === "database" && value.externalProviders !== undefined) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["externalProviders"],
				message:
					'externalProviders cannot be combined with provider.source="database" in the same selection',
			});
		}
		if (
			value.activeProviderId &&
			(!value.externalProviders || value.externalProviders.length === 0)
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["activeProviderId"],
				message: "activeProviderId requires externalProviders to be configured",
			});
		}
		if (value.activeProviderId && value.externalProviders) {
			const hasActive = value.externalProviders.some(
				(provider) => provider.id === value.activeProviderId,
			);
			if (!hasActive) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["activeProviderId"],
					message: "activeProviderId must match one of externalProviders[].id",
				});
			}
		}
	});

export function validateSearchProviderSelection(value: unknown): SearchProviderSelection {
	return searchProviderSelectionSchema.parse(value);
}

export function validateSearchProviderSelectionSafe(value: unknown): {
	success: boolean;
	data?: SearchProviderSelection;
	errors?: string[];
} {
	const parsed = searchProviderSelectionSchema.safeParse(value);
	if (parsed.success) {
		return { success: true, data: parsed.data };
	}
	return {
		success: false,
		errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
	};
}
