import type { Kysely, SqlBool } from "kysely";
import { sql } from "kysely";

import type { Database } from "../database/types.js";
import { validateIdentifier } from "../database/validate.js";
import { resolveConfiguredLocale } from "../i18n/config.js";
import { localeMatches } from "../i18n/query.js";
import type { CollectionSearchMetadata } from "./fts-manager.js";
import type {
	CollectionSearchOptions,
	SearchOptions,
	SearchResponse,
	SearchResult,
	SearchStats,
	SuggestOptions,
	Suggestion,
} from "./types.js";

function tsVectorDocumentExpr(searchableFields: readonly string[]) {
	const parts = searchableFields.map((field) => {
		validateIdentifier(field, "searchable field name");
		return sql<string>`COALESCE(c.${sql.ref(field)}::text, '')`;
	});
	return sql<string>`concat_ws(' ', ${sql.join(parts, sql`, `)})`;
}

function titleExprFromMetadata(metadata: CollectionSearchMetadata) {
	const { titleField } = metadata.config;
	if (titleField) {
		validateIdentifier(titleField, "title field");
		return sql`c.${sql.ref(titleField)}`;
	}
	return metadata.hasTitle ? sql`c.title` : sql`NULL`;
}

async function searchSingleCollectionPostgres(
	db: Kysely<Database>,
	collection: string,
	query: string,
	options: CollectionSearchOptions,
	metadata: CollectionSearchMetadata,
): Promise<SearchResult[]> {
	validateIdentifier(collection, "collection slug");
	const contentTable = `ec_${collection}`;
	const limit = options.limit ?? 20;
	const status = options.status ?? "published";
	const locale = options.locale ? resolveConfiguredLocale(options.locale) : undefined;
	const { searchableFields } = metadata;
	if (searchableFields.length === 0) return [];

	const queryText = query.trim();
	if (!queryText) return [];

	let scopedFields = searchableFields;
	if (options.scope === "title") {
		const titleColumn =
			metadata.config.titleField && searchableFields.includes(metadata.config.titleField)
				? metadata.config.titleField
				: searchableFields.includes("title")
					? "title"
					: undefined;
		if (!titleColumn) return [];
		scopedFields = [titleColumn];
	}

	const documentExpr = tsVectorDocumentExpr(scopedFields);
	const titleExpr = titleExprFromMetadata(metadata);
	const tsQueryExpr = sql`websearch_to_tsquery('simple', ${queryText})`;
	const vectorExpr = sql`to_tsvector('simple', ${documentExpr})`;
	let localeFilter = sql<SqlBool>`TRUE`;
	if (locale) {
		localeFilter = localeMatches("c.locale", locale);
	}

	const rows = await sql<{
		id: string;
		slug: string | null;
		locale: string;
		title: string | null;
		snippet: string | null;
		score: number;
	}>`
		SELECT
			c.id,
			c.slug,
			c.locale,
			${titleExpr} as title,
			ts_headline(
				'simple',
				${documentExpr},
				${tsQueryExpr},
				'StartSel=<mark>,StopSel=</mark>,MaxWords=32,MinWords=5'
			) as snippet,
			ts_rank(${vectorExpr}, ${tsQueryExpr}) as score
		FROM ${sql.ref(contentTable)} c
		WHERE ${vectorExpr} @@ ${tsQueryExpr}
		AND c.status = ${status}
		AND c.deleted_at IS NULL
		AND ${localeFilter}
		ORDER BY score DESC
		LIMIT ${limit}
	`.execute(db);

	return rows.rows.map((row) => ({
		collection,
		id: row.id,
		slug: row.slug,
		locale: row.locale,
		title: row.title ?? undefined,
		snippet: row.snippet ?? undefined,
		score: row.score,
	}));
}

export async function searchWithPostgresLexical(
	db: Kysely<Database>,
	query: string,
	options: SearchOptions,
	metadata: Map<string, CollectionSearchMetadata>,
): Promise<SearchResponse> {
	const limit = options.limit ?? 20;
	const collections = options.collections?.length ? options.collections : [...metadata.keys()];
	const allResults: SearchResult[] = [];
	for (const collection of collections) {
		const collectionMetadata = metadata.get(collection);
		if (!collectionMetadata) continue;
		const hits = await searchSingleCollectionPostgres(
			db,
			collection,
			query,
			{
				status: options.status,
				locale: options.locale,
				limit,
				scope: options.scope,
			},
			collectionMetadata,
		);
		allResults.push(...hits);
	}
	allResults.sort((a, b) => b.score - a.score);
	const offset = 0;
	const items = allResults.slice(offset, offset + limit);
	return {
		items,
		nextCursor: undefined,
	};
}

export async function searchCollectionWithPostgresLexical(
	db: Kysely<Database>,
	collection: string,
	query: string,
	options: CollectionSearchOptions,
	metadata: CollectionSearchMetadata | undefined,
): Promise<SearchResponse> {
	if (!metadata) return { items: [] };
	const items = await searchSingleCollectionPostgres(db, collection, query, options, metadata);
	return {
		items,
	};
}

export async function getPostgresLexicalSuggestions(
	db: Kysely<Database>,
	query: string,
	options: SuggestOptions,
	metadata: Map<string, CollectionSearchMetadata>,
): Promise<Suggestion[]> {
	const limit = options.limit ?? 5;
	const locale = options.locale ? resolveConfiguredLocale(options.locale) : undefined;
	const collections = options.collections?.length ? options.collections : [...metadata.keys()];
	const q = query.trim();
	if (!q) return [];
	const suggestions: Suggestion[] = [];

	for (const collection of collections) {
		const collectionMetadata = metadata.get(collection);
		if (!collectionMetadata) continue;
		validateIdentifier(collection, "collection slug");
		const contentTable = `ec_${collection}`;
		const titleExpr = titleExprFromMetadata(collectionMetadata);
		let localeFilter = sql<SqlBool>`TRUE`;
		if (locale) {
			localeFilter = localeMatches("c.locale", locale);
		}
		const rows = await sql<{ id: string; slug: string | null; title: string }>`
			SELECT
				c.id,
				c.slug,
				${titleExpr} as title
			FROM ${sql.ref(contentTable)} c
			WHERE c.status = 'published'
			AND c.deleted_at IS NULL
			AND ${titleExpr} IS NOT NULL
			AND ${localeFilter}
			AND ${titleExpr}::text ILIKE ${`${q}%`}
			ORDER BY c.updated_at DESC
			LIMIT ${limit}
		`.execute(db);
		for (const row of rows.rows) {
			suggestions.push({
				collection,
				id: row.id,
				slug: row.slug,
				title: row.title,
			});
		}
	}

	return suggestions.slice(0, limit);
}

export async function getPostgresLexicalStats(
	db: Kysely<Database>,
	metadata: Map<string, CollectionSearchMetadata>,
): Promise<SearchStats> {
	const stats: SearchStats = { collections: {} };
	for (const collection of metadata.keys()) {
		validateIdentifier(collection, "collection slug");
		const contentTable = `ec_${collection}`;
		const result = await sql<{ count: number }>`
			SELECT COUNT(*) as count
			FROM ${sql.ref(contentTable)}
			WHERE deleted_at IS NULL
		`.execute(db);
		stats.collections[collection] = {
			indexed: result.rows[0]?.count ?? 0,
		};
	}
	return stats;
}
