import type { Kysely } from "kysely";
import { afterEach, beforeEach, expect, it } from "vitest";

import type { Database } from "../../../src/database/types.js";
import { SchemaRegistry } from "../../../src/schema/registry.js";
import { FTSManager } from "../../../src/search/fts-manager.js";
import { getSearchStats, getSuggestions, searchWithDb } from "../../../src/search/query.js";
import {
	describeEachDialect,
	setupForDialect,
	teardownForDialect,
	type DialectName,
	type DialectTestContext,
} from "../../utils/test-db.js";

describeEachDialect("search query behavior", (dialect: DialectName) => {
	let ctx: DialectTestContext | undefined;
	let db: Kysely<Database>;

	beforeEach(async () => {
		ctx = await setupForDialect(dialect);
		db = ctx.db;
		const registry = new SchemaRegistry(db);
		await registry.createCollection({
			slug: "articles",
			label: "Articles",
			supports: ["search"],
		});
		await registry.createField("articles", {
			slug: "title",
			label: "Title",
			type: "string",
			searchable: true,
		});
		await registry.createField("articles", {
			slug: "body",
			label: "Body",
			type: "string",
			searchable: true,
		});
		const fts = new FTSManager(db);
		await fts.enableSearch("articles");

		await db
			.insertInto("ec_articles")
			.values({
				id: "article-alpha",
				slug: "alpha",
				status: "published",
				title: "Alpha story",
				body: "alpha beta gamma",
				author_id: null,
				primary_byline_id: null,
				created_at: "2026-10-27T00:00:00.000Z",
				updated_at: "2026-10-27T00:00:00.000Z",
				published_at: "2026-10-27T00:00:00.000Z",
				scheduled_at: null,
				deleted_at: null,
				version: 1,
				live_revision_id: null,
				draft_revision_id: null,
				locale: "en",
				translation_group: "tg-alpha",
			})
			.execute();
		await db
			.insertInto("ec_articles")
			.values({
				id: "article-draft-alpha",
				slug: "draft-alpha",
				status: "draft",
				title: "Alpha draft",
				body: "alpha only draft",
				author_id: null,
				primary_byline_id: null,
				created_at: "2026-10-27T00:00:00.000Z",
				updated_at: "2026-10-27T00:00:00.000Z",
				published_at: null,
				scheduled_at: null,
				deleted_at: null,
				version: 1,
				live_revision_id: null,
				draft_revision_id: null,
				locale: "en",
				translation_group: "tg-draft-alpha",
			})
			.execute();
	});

	afterEach(async () => {
		await teardownForDialect(ctx);
	});

	it("returns search hits, suggestions, and stats for enabled collections", async () => {
		const search = await searchWithDb(db, "alpha", {
			collections: ["articles"],
			status: "published",
		});
		expect(search.items.some((item) => item.slug === "alpha")).toBe(true);
		expect(search.items.some((item) => item.slug === "draft-alpha")).toBe(false);

		const suggestions = await getSuggestions(db, "Al", {
			collections: ["articles"],
		});
		expect(suggestions.some((item) => item.slug === "alpha")).toBe(true);
		expect(suggestions.some((item) => item.slug === "draft-alpha")).toBe(false);

		const stats = await getSearchStats(db);
		expect(stats.collections.articles).toBeDefined();
		expect(stats.collections.articles?.indexed).toBeGreaterThanOrEqual(1);
	});
});
