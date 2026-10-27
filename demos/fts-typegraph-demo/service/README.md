# Typegraph demo service

This service exposes a small external FTS API for the CMS demo.

## Endpoints

- `POST /search`
- `POST /suggest`
- `GET /stats`
- `POST /reindex`

## Reindex request

```json
{
	"cmsSnapshotUrl": "http://127.0.0.1:4321/_emdash/api/content/export"
}
```
