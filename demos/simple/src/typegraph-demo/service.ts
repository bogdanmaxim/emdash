import type { Kysely } from "kysely";
import { sql } from "kysely";

interface TypegraphSearchPayload {
	query?: unknown;
	collections?: unknown;
	status?: unknown;
	locale?: unknown;
	limit?: unknown;
}

interface TypegraphSuggestPayload {
	query?: unknown;
	collections?: unknown;
	locale?: unknown;
	limit?: unknown;
}

const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*$/;

function isIdentifier(value: string): boolean {
	return IDENTIFIER_PATTERN.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeCollections(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const collections = value.filter((entry): entry is string => typeof entry === "string");
	const safe = collections.filter((slug) => isIdentifier(slug));
	return safe.length > 0 ? safe : undefined;
}

function normalizeLimit(value: unknown, defaultLimit: number): number {
	if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) return defaultLimit;
	return Math.min(value, 100);
}

function normalizeLocale(value: unknown): string | undefined {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function parseSearchEnabled(raw: string | null): boolean {
	if (!raw) return false;
	try {
		const parsed = JSON.parse(raw);
		return !!parsed && typeof parsed === "object" && "enabled" in parsed && parsed.enabled === true;
	} catch {
		return false;
	}
}

async function getSearchableCollections(
	db: Kysely<unknown>,
	requestedCollections?: string[],
): Promise<string[]> {
	let query = db
		.selectFrom("_emdash_collections as c")
		.innerJoin("_emdash_fields as f", "f.collection_id", "c.id")
		.select(["c.slug", "c.search_config"])
		.where("f.slug", "=", "title");
	if (requestedCollections && requestedCollections.length > 0) {
		query = query.where("c.slug", "in", requestedCollections);
	}
	const rows = await query.execute();
	return rows.filter((row) => parseSearchEnabled(row.search_config)).map((row) => row.slug);
}

export async function typegraphSearch(
	db: Kysely<unknown>,
	payload: unknown,
) {
	const parsed: TypegraphSearchPayload = isRecord(payload) ? payload : {};
	const query = typeof parsed.query === "string" ? parsed.query.trim() : "";
	if (!query) return { items: [] as unknown[] };
	const status = typeof parsed.status === "string" ? parsed.status : "published";
	const locale = normalizeLocale(parsed.locale);
	const limit = normalizeLimit(parsed.limit, 20);
	const collections = await getSearchableCollections(db, normalizeCollections(parsed.collections));
	const items: Array<Record<string, unknown>> = [];
	const queryLike = `%${query.toLowerCase()}%`;
	for (const collection of collections) {
		const contentTable = `ec_${collection}`;
		let rowsQuery = sql<{
			id: string;
			slug: string | null;
			locale: string;
			title: string | null;
			score: number;
		}>`
			SELECT
				id,
				slug,
				locale,
				title,
				CASE
					WHEN lower(title) = lower(${query}) THEN 100
					WHEN lower(title) LIKE ${queryLike} THEN 60
					ELSE 40
				END AS score
			FROM ${sql.ref(contentTable)}
			WHERE deleted_at IS NULL
			AND title IS NOT NULL
			AND lower(title) LIKE ${queryLike}
		`;
		if (status !== "all") {
			rowsQuery = sql<{
				id: string;
				slug: string | null;
				locale: string;
				title: string | null;
				score: number;
			}>`${rowsQuery} AND status = ${status}`;
		}
		if (locale) {
			rowsQuery = sql<{
				id: string;
				slug: string | null;
				locale: string;
				title: string | null;
				score: number;
			}>`${rowsQuery} AND locale = ${locale}`;
		}
		rowsQuery = sql<{
			id: string;
			slug: string | null;
			locale: string;
			title: string | null;
			score: number;
		}>`${rowsQuery} ORDER BY score DESC, updated_at DESC LIMIT ${limit}`;

		const rows = await rowsQuery.execute(db);
		for (const row of rows.rows) {
			items.push({
				collection,
				id: row.id,
				slug: row.slug,
				locale: row.locale,
				title: row.title ?? undefined,
				snippet: row.title ?? undefined,
				score: row.score,
			});
		}
	}
	items.sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0));
	return {
		items: items.slice(0, limit),
	};
}

export async function typegraphSuggest(
	db: Kysely<unknown>,
	payload: unknown,
) {
	const parsed: TypegraphSuggestPayload = isRecord(payload) ? payload : {};
	const query = typeof parsed.query === "string" ? parsed.query.trim() : "";
	if (!query) return { items: [] as unknown[] };
	const locale = normalizeLocale(parsed.locale);
	const limit = normalizeLimit(parsed.limit, 5);
	const collections = await getSearchableCollections(db, normalizeCollections(parsed.collections));
	const prefix = `${query.toLowerCase()}%`;
	const items: Array<Record<string, unknown>> = [];
	for (const collection of collections) {
		const contentTable = `ec_${collection}`;
		let rowsQuery = sql<{ id: string; slug: string | null; title: string }>`
			SELECT id, slug, title
			FROM ${sql.ref(contentTable)}
			WHERE deleted_at IS NULL
			AND status = 'published'
			AND title IS NOT NULL
			AND lower(title) LIKE ${prefix}
		`;
		if (locale) {
			rowsQuery = sql<{ id: string; slug: string | null; title: string }>`
				${rowsQuery} AND locale = ${locale}
			`;
		}
		rowsQuery = sql<{ id: string; slug: string | null; title: string }>`
			${rowsQuery}
			ORDER BY updated_at DESC
			LIMIT ${limit}
		`;
		const rows = await rowsQuery.execute(db);
		for (const row of rows.rows) {
			items.push({
				collection,
				id: row.id,
				slug: row.slug,
				title: row.title,
			});
		}
	}
	return {
		items: items.slice(0, limit),
	};
}

export async function typegraphStats(db: Kysely<unknown>) {
	const collections = await getSearchableCollections(db);
	const stats: Record<string, { indexed: number }> = {};
	for (const collection of collections) {
		const contentTable = `ec_${collection}`;
		const result = await sql<{ count: number }>`
			SELECT COUNT(*) AS count
			FROM ${sql.ref(contentTable)}
			WHERE deleted_at IS NULL
		`.execute(db);
		stats[collection] = { indexed: result.rows[0]?.count ?? 0 };
	}
	return { collections: stats };
}
