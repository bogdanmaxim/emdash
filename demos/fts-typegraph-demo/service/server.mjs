import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const defaultDbPath = resolve(__dirname, "../cms/data.db");
const dbPath = process.env.EMDASH_TYPEGRAPH_DEMO_DB_PATH || defaultDbPath;
const port = Number(process.env.EMDASH_TYPEGRAPH_DEMO_PORT || "8788");

const db = new DatabaseSync(dbPath, {
	open: true,
	readonly: false,
});
const collectionSlugPattern = /^[a-z][a-z0-9_]*$/;

function jsonResponse(res, status, body) {
	res.writeHead(status, { "Content-Type": "application/json" });
	res.end(JSON.stringify(body));
}

function parseBody(req) {
	return new Promise((resolveBody) => {
		const chunks = [];
		req.on("data", (chunk) => chunks.push(chunk));
		req.on("end", () => {
			let parsed = {};
			try {
				parsed = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
			} catch {
				parsed = {};
			}
			resolveBody(parsed);
		});
	});
}

function safeCollections(raw) {
	if (!Array.isArray(raw)) return [];
	return raw.filter((entry) => typeof entry === "string" && collectionSlugPattern.test(entry));
}

function getSearchableCollections(collections) {
	let sql = "SELECT slug, search_config FROM _emdash_collections";
	let args = [];
	if (collections.length > 0) {
		sql += ` WHERE slug IN (${collections.map(() => "?").join(", ")})`;
		args = collections;
	}
	const rows = db.prepare(sql).all(...args);
	return rows
		.filter((row) => {
			try {
				const parsed = JSON.parse(row.search_config || "null");
				return !!parsed?.enabled;
			} catch {
				return false;
			}
		})
		.map((row) => row.slug);
}

function searchCollection(collection, query, status, locale, limit) {
	const table = `ec_${collection}`;
	let sql = `
		SELECT id, slug, locale, title, updated_at
		FROM "${table}"
		WHERE deleted_at IS NULL
		  AND title IS NOT NULL
		  AND lower(title) LIKE lower(?)
	`;
	const args = [`%${query}%`];
	if (status && status !== "all") {
		sql += " AND status = ?";
		args.push(status);
	}
	if (locale) {
		sql += " AND locale = ?";
		args.push(locale);
	}
	sql += " ORDER BY updated_at DESC LIMIT ?";
	args.push(limit);
	const rows = db.prepare(sql).all(...args);
	return rows.map((row) => ({
		collection,
		id: row.id,
		slug: row.slug,
		locale: row.locale,
		title: row.title,
		snippet: row.title,
		score: row.title?.toLowerCase() === query.toLowerCase() ? 100 : 60,
	}));
}

function suggestCollection(collection, query, locale, limit) {
	const table = `ec_${collection}`;
	let sql = `
		SELECT id, slug, title, updated_at
		FROM "${table}"
		WHERE deleted_at IS NULL
		  AND status = 'published'
		  AND title IS NOT NULL
		  AND lower(title) LIKE lower(?)
	`;
	const args = [`${query}%`];
	if (locale) {
		sql += " AND locale = ?";
		args.push(locale);
	}
	sql += " ORDER BY updated_at DESC LIMIT ?";
	args.push(limit);
	const rows = db.prepare(sql).all(...args);
	return rows.map((row) => ({
		collection,
		id: row.id,
		slug: row.slug,
		title: row.title,
	}));
}

function statsForCollection(collection) {
	const table = `ec_${collection}`;
	const row = db.prepare(`SELECT COUNT(*) AS count FROM "${table}" WHERE deleted_at IS NULL`).get();
	return { indexed: row?.count ?? 0 };
}

function parseContentExportCount(payload) {
	if (Array.isArray(payload)) return payload.length;
	if (payload && typeof payload === "object") {
		if (Array.isArray(payload.items)) return payload.items.length;
		if (Array.isArray(payload.entries)) return payload.entries.length;
	}
	return 0;
}

const server = createServer(async (req, res) => {
	if (!req.url) return jsonResponse(res, 400, { error: "missing url" });
	if (req.method === "POST" && req.url === "/search") {
		const body = await parseBody(req);
		const query = typeof body.query === "string" ? body.query.trim() : "";
		if (!query) return jsonResponse(res, 200, { items: [] });
		const collections = getSearchableCollections(safeCollections(body.collections));
		const status = typeof body.status === "string" ? body.status : "published";
		const locale = typeof body.locale === "string" ? body.locale : undefined;
		const limit = Number.isInteger(body.limit) && body.limit > 0 ? Math.min(body.limit, 100) : 20;
		const items = collections.flatMap((collection) =>
			searchCollection(collection, query, status, locale, limit),
		);
		items.sort((a, b) => b.score - a.score);
		return jsonResponse(res, 200, { items: items.slice(0, limit) });
	}
	if (req.method === "POST" && req.url === "/suggest") {
		const body = await parseBody(req);
		const query = typeof body.query === "string" ? body.query.trim() : "";
		if (!query) return jsonResponse(res, 200, { items: [] });
		const collections = getSearchableCollections(safeCollections(body.collections));
		const locale = typeof body.locale === "string" ? body.locale : undefined;
		const limit = Number.isInteger(body.limit) && body.limit > 0 ? Math.min(body.limit, 100) : 5;
		const items = collections.flatMap((collection) =>
			suggestCollection(collection, query, locale, limit),
		);
		return jsonResponse(res, 200, { items: items.slice(0, limit) });
	}
	if (req.method === "GET" && req.url === "/stats") {
		const collections = getSearchableCollections([]);
		const result = Object.fromEntries(
			collections.map((collection) => [collection, statsForCollection(collection)]),
		);
		return jsonResponse(res, 200, { collections: result });
	}
	if (req.method === "POST" && req.url === "/reindex") {
		const body = await parseBody(req);
		const cmsSnapshotUrl =
			typeof body.cmsSnapshotUrl === "string" ? body.cmsSnapshotUrl.trim() : "";
		if (!cmsSnapshotUrl) {
			return jsonResponse(res, 400, { error: "cmsSnapshotUrl is required" });
		}
		let parsedUrl;
		try {
			parsedUrl = new URL(cmsSnapshotUrl);
		} catch {
			return jsonResponse(res, 400, { error: "cmsSnapshotUrl must be a valid URL" });
		}
		try {
			const snapshotResponse = await fetch(parsedUrl, {
				headers: { Accept: "application/json" },
			});
			if (!snapshotResponse.ok) {
				return jsonResponse(res, 502, {
					error: "snapshot request failed",
					status: snapshotResponse.status,
				});
			}
			const payload = await snapshotResponse.json();
			const imported = parseContentExportCount(payload);
			return jsonResponse(res, 200, {
				ok: true,
				imported,
				note: "demo reindex endpoint validated and fetched snapshot payload",
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : "reindex failed";
			return jsonResponse(res, 500, { error: message });
		}
	}
	return jsonResponse(res, 404, { error: "not found" });
});

server.listen(port, () => {
	const bannerPath = join(__dirname, "README.md");
	const banner = readFileSync(bannerPath, "utf8");
	console.log(`Typegraph demo service listening on ${port}\nDB path: ${dbPath}\n\n${banner}`);
});
