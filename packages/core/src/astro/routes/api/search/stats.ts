/**
 * Search stats endpoint
 *
 * GET /_emdash/api/search/stats
 */

import type { APIRoute } from "astro";

import { requirePerm } from "#api/authorize.js";
import { apiError, apiSuccess, handleError } from "#api/error.js";
import { FTSManager, getSearchStats } from "#search/index.js";

export const prerender = false;

/**
 * Get search index statistics
 */
export const GET: APIRoute = async ({ locals }) => {
	const { emdash, user } = locals;

	const denied = requirePerm(user, "search:manage");
	if (denied) return denied;

	if (!emdash?.db) {
		return apiError("NOT_CONFIGURED", "EmDash not configured", 500);
	}

	try {
		const fts = new FTSManager(emdash.db);
		if (!fts.isSearchSupported()) {
			return apiError("SEARCH_UNSUPPORTED", fts.unsupportedMessage("read search statistics"), 503);
		}

		const stats = await getSearchStats(emdash.db);

		return apiSuccess(stats);
	} catch (error) {
		return handleError(error, "Failed to get stats", "STATS_ERROR");
	}
};
