import type { SearchBackendResolution } from "./provider-resolution.js";
import type {
	CollectionSearchOptions,
	SearchResponse,
	SearchResult,
	SearchStats,
	Suggestion,
} from "./types.js";

interface TypegraphSearchRequest {
	query: string;
	collections?: readonly string[];
	status: string;
	locale?: string;
	limit: number;
	cursor?: string;
	scope?: "all" | "title";
}

interface TypegraphSuggestionRequest {
	query: string;
	collections?: readonly string[];
	locale?: string;
	limit: number;
}

interface TypegraphProviderConfig {
	endpoint: string;
	token?: string;
	headers?: Record<string, string>;
	timeoutMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object";
}

function getTypegraphProviderConfig(backend: SearchBackendResolution): TypegraphProviderConfig {
	const config = backend.providerSchema?.config;
	if (!isRecord(config)) {
		throw new Error("Typegraph search provider configuration is missing");
	}
	const endpoint = config.endpoint;
	if (typeof endpoint !== "string" || endpoint.trim().length === 0) {
		throw new Error("Typegraph search provider requires a non-empty endpoint");
	}
	let parsedEndpoint: URL;
	try {
		parsedEndpoint = new URL(endpoint);
	} catch {
		throw new Error("Typegraph search provider endpoint must be a valid URL");
	}
	const token =
		typeof config.token === "string" && config.token.trim().length > 0 ? config.token : undefined;
	const timeoutMs =
		typeof config.timeoutMs === "number" &&
		Number.isFinite(config.timeoutMs) &&
		config.timeoutMs > 0
			? config.timeoutMs
			: undefined;
	const headers =
		config.headers && typeof config.headers === "object" && !Array.isArray(config.headers)
			? Object.fromEntries(
					Object.entries(config.headers).filter(
						([key, value]) =>
							typeof key === "string" &&
							key.trim().length > 0 &&
							typeof value === "string" &&
							value.trim().length > 0,
					),
				)
			: undefined;
	return {
		endpoint: parsedEndpoint.toString(),
		token,
		headers,
		timeoutMs,
	};
}

function normalizeSearchResult(row: unknown): SearchResult | null {
	if (!isRecord(row)) return null;
	const item = row;
	if (
		typeof item.collection !== "string" ||
		typeof item.id !== "string" ||
		typeof item.score !== "number"
	) {
		return null;
	}
	return {
		collection: item.collection,
		id: item.id,
		entityType: typeof item.entityType === "string" ? item.entityType : undefined,
		text: typeof item.text === "string" ? item.text : undefined,
		slug: typeof item.slug === "string" || item.slug === null ? item.slug : null,
		locale: typeof item.locale === "string" ? item.locale : "en",
		title: typeof item.title === "string" ? item.title : undefined,
		snippet: typeof item.snippet === "string" ? item.snippet : undefined,
		highlights: Array.isArray(item.highlights)
			? item.highlights.filter((entry): entry is string => typeof entry === "string")
			: undefined,
		references: Array.isArray(item.references)
			? item.references
					.map((entry) =>
						isRecord(entry)
							? {
									id: typeof entry.id === "string" ? entry.id : "",
									entityType: typeof entry.entityType === "string" ? entry.entityType : "",
								}
							: null,
					)
					.filter(
						(entry): entry is { id: string; entityType: string } =>
							!!entry && !!entry.id && !!entry.entityType,
					)
			: undefined,
		score: item.score,
		ranking: typeof item.ranking === "number" ? item.ranking : undefined,
	};
}

async function callTypegraph(
	backend: SearchBackendResolution,
	path: string,
	body?: unknown,
): Promise<unknown> {
	const provider = getTypegraphProviderConfig(backend);
	const url = new URL(path, provider.endpoint);
	const controller = new AbortController();
	const timeoutMs = provider.timeoutMs ?? 15_000;
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		...provider.headers,
	};
	if (provider.token) {
		headers.Authorization = "Bearer " + provider.token;
	}
	try {
		const response = await fetch(url, {
			method: body ? "POST" : "GET",
			headers,
			body: body ? JSON.stringify(body) : undefined,
			signal: controller.signal,
		});
		if (!response.ok) {
			throw new Error(
				`Typegraph search provider request failed (${response.status}${response.statusText ? ` ${response.statusText}` : ""})`,
			);
		}
		return await response.json();
	} catch (error) {
		if (error instanceof Error && error.name === "AbortError") {
			throw new Error("Typegraph search provider request timed out", { cause: error });
		}
		throw error;
	} finally {
		clearTimeout(timeout);
	}
}

export async function searchWithTypegraph(
	backend: SearchBackendResolution,
	query: string,
	options: CollectionSearchOptions & {
		collections?: readonly string[];
		cursor?: string;
	},
): Promise<SearchResponse> {
	const payload: TypegraphSearchRequest = {
		query,
		collections: options.collections,
		status: options.status ?? "published",
		locale: options.locale,
		limit: options.limit ?? 20,
		cursor: options.cursor,
		scope: options.scope,
	};
	const data = await callTypegraph(backend, "/search", payload);
	const items =
		isRecord(data) && Array.isArray(data.items)
			? data.items.map(normalizeSearchResult).filter((row): row is SearchResult => !!row)
			: [];
	const nextCursor =
		isRecord(data) && typeof data.nextCursor === "string" ? data.nextCursor : undefined;
	return { items, nextCursor };
}

export async function getTypegraphSuggestions(
	backend: SearchBackendResolution,
	query: string,
	options: {
		collections?: readonly string[];
		locale?: string;
		limit?: number;
	},
): Promise<Suggestion[]> {
	const payload: TypegraphSuggestionRequest = {
		query,
		collections: options.collections,
		locale: options.locale,
		limit: options.limit ?? 5,
	};
	const data = await callTypegraph(backend, "/suggest", payload);
	if (!isRecord(data) || !Array.isArray(data.items)) return [];
	const suggestions: Suggestion[] = [];
	for (const item of data.items) {
		if (!isRecord(item)) continue;
		if (
			typeof item.collection !== "string" ||
			typeof item.id !== "string" ||
			typeof item.title !== "string"
		) {
			continue;
		}
		const suggestion: Suggestion = {
			collection: item.collection,
			id: item.id,
			title: item.title,
		};
		if (typeof item.slug === "string" || item.slug === null) {
			suggestion.slug = item.slug;
		}
		suggestions.push(suggestion);
	}
	return suggestions;
}

export async function getTypegraphStats(backend: SearchBackendResolution): Promise<SearchStats> {
	const data = await callTypegraph(backend, "/stats");
	if (!isRecord(data) || !isRecord(data.collections)) {
		return { collections: {} };
	}
	const collections: SearchStats["collections"] = {};
	for (const [collection, value] of Object.entries(data.collections)) {
		if (!isRecord(value)) continue;
		const entry = value;
		if (typeof entry.indexed !== "number") continue;
		collections[collection] = {
			indexed: entry.indexed,
			lastRebuilt: typeof entry.lastRebuilt === "string" ? entry.lastRebuilt : undefined,
		};
	}
	return { collections };
}
