# Typegraph FTS Bridge Plugin (Demo)

This demo plugin does two things:

1. listens to EmDash content lifecycle events and forwards them externally via:
   - webhook sink
   - Cloudflare Queues
   - AWS SNS
2. exposes a reindex trigger route that asks the external service to build a full snapshot index from CMS data.

Implementation can be created in `src/index.ts` using this contract.

## Expected behavior contract

- On `content:afterSave` and `content:afterDelete`, publish normalized events:
  - `event`
  - `collection`
  - `id`
  - `occurredAt`
  - optional `payload`
- Forward mode is selected with one of:
  - `webhook`
  - `cloudflare-queue`
  - `aws-sns`
- Reindex route calls external service `POST /reindex` with:
  - `cmsSnapshotUrl`
