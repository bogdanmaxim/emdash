# FTS Typegraph Demo

This demo contains a reference setup for an external full-text search provider wired to EmDash.

## Structure

- `cms/` — EmDash instance with the demo plugin enabled.
- `plugin/` — plugin that listens to EmDash content events and forwards updates to external infrastructure.
- `service/` — external search service facade that forwards reindex/search work to Typegraph.

## Event forwarding modes

The plugin supports three forwarding modes:

- `webhook` (HTTP sink)
- `cloudflare-queue`
- `aws-sns`

## Reindex flow

1. Plugin sends `reindex` trigger to `service`.
2. Service requests a full snapshot from CMS.
3. Service submits data to Typegraph indexing endpoint.
