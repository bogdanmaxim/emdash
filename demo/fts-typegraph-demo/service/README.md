# Typegraph External Service (Demo)

This service receives event stream messages and reindex triggers from the demo plugin.

## API sketch

- `POST /events` — receives incremental content change events.
- `POST /reindex` — triggers a full snapshot pull from CMS and submits to Typegraph.

## Reindex request body

```json
{
	"cmsSnapshotUrl": "http://localhost:4321/_emdash/api/content/export"
}
```
