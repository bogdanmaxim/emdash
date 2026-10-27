# FTS Typegraph Demo

This demo is organized into three folders:

- `cms/` — Astro + EmDash CMS site
- `plugin/` — demo search-provider selection module used by CMS config
- `service/` — standalone Typegraph-like HTTP service (`/search`, `/suggest`, `/stats`, `/reindex`)

## Run

```bash
pnpm --filter @emdash-cms/demo-fts-typegraph service
pnpm --filter @emdash-cms/demo-fts-typegraph dev
pnpm --filter @emdash-cms/demo-fts-typegraph typecheck
```

Optional env:

- `EMDASH_TYPEGRAPH_DEMO_ENDPOINT` (default `http://127.0.0.1:8788`)
- `EMDASH_TYPEGRAPH_DEMO_DB_PATH` (default `./cms/data.db`)
- `EMDASH_TYPEGRAPH_DEMO_PORT` (default `8788`)
