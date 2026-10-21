# CMS Demo Instance

This folder documents how to run an EmDash instance with the Typegraph FTS bridge plugin enabled.

Example integration sketch:

```ts
import emdash from "emdash/astro";
import { sqlite } from "emdash/db";
import { createTypegraphFtsBridgePlugin } from "../plugin/src/index.js";

export default defineConfig({
	integrations: [
		emdash({
			database: sqlite({ url: "file:./.data/emdash.db" }),
			search: {
				provider: {
					id: "typegraph-demo",
					source: "external",
					enabled: true,
					engine: "fts5",
				},
			},
			plugins: [
				createTypegraphFtsBridgePlugin({
					forwarder: { mode: "webhook", endpoint: "http://localhost:9010/events" },
					reindex: {
						endpoint: "http://localhost:9010/reindex",
						cmsSnapshotUrl: "http://localhost:4321/_emdash/api/content/export",
					},
				}),
			],
		}),
	],
});
```
