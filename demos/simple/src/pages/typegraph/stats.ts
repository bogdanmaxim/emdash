import type { APIRoute } from "astro";

import { typegraphStats } from "../../typegraph-demo/service.js";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
	const db = locals.emdash?.db;
	if (!db) {
		return new Response(JSON.stringify({ error: "EmDash not configured" }), { status: 500 });
	}

	const result = await typegraphStats(db);
	return new Response(JSON.stringify(result), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
};
