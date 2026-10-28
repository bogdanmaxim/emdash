import node from "@astrojs/node";
import react from "@astrojs/react";
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
import { sqlite } from "emdash/db";

import { typegraphSearchSelection } from "../plugin/index.mjs";

const typegraphEndpoint = process.env.EMDASH_TYPEGRAPH_DEMO_ENDPOINT ?? "http://127.0.0.1:8788";

export default defineConfig({
	output: "server",
	adapter: node({ mode: "standalone" }),
	integrations: [
		react(),
		emdash({
			database: sqlite({ url: "file:./data.db" }),
			search: typegraphSearchSelection(typegraphEndpoint),
		}),
	],
});
