import type { APIRoute } from "astro";

import { typegraphSearch } from "../../typegraph-demo/service.js";

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
	const db = locals.emdash?.db;
	if (!db) {
		return new Response(JSON.stringify({ error: "EmDash not configured" }), { status: 500 });
	}

	const payload: unknown = await request.json().catch(() => ({}));
	const result = await typegraphSearch(db, payload);
	return new Response(JSON.stringify(result), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
};
