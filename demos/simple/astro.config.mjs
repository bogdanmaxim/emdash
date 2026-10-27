import node from "@astrojs/node";
import react from "@astrojs/react";
import auditLog from "@emdash-cms/plugin-audit-log";
import { mcpSmokePlugin } from "@emdash-cms/plugin-mcp-smoke";
import { defineConfig, fontProviders } from "astro/config";
import { externalSearchProvider } from "emdash";
import emdash, { local } from "emdash/astro";
import { sqlite } from "emdash/db";

const typegraphEndpoint = process.env.EMDASH_TYPEGRAPH_DEMO_ENDPOINT;

export default defineConfig({
	output: "server",
	adapter: node({
		mode: "standalone",
	}),
	image: {
		layout: "constrained",
		responsiveStyles: true,
	},
	integrations: [
		react(),
		emdash({
			database: sqlite({ url: "file:./data.db" }),
			storage: local({
				directory: "./uploads",
				baseUrl: "/_emdash/api/media/file",
			}),
			plugins: [auditLog, mcpSmokePlugin()],
			search: typegraphEndpoint
				? externalSearchProvider({
						id: "demo-typegraph",
						engine: "typegraph",
						enabled: true,
						schema: {
							name: "typegraph-demo",
							config: { endpoint: typegraphEndpoint },
						},
					})
				: undefined,
		}),
	],
	fonts: [
		{
			provider: fontProviders.google(),
			name: "Inter",
			cssVariable: "--font-body",
			weights: [400, 500, 600, 700],
			fallbacks: ["sans-serif"],
		},
		{
			provider: fontProviders.google(),
			name: "JetBrains Mono",
			cssVariable: "--font-mono",
			weights: [400, 500],
			fallbacks: ["monospace"],
		},
	],
	devToolbar: { enabled: false },
});
