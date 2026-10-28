---
"emdash": minor
---

Adds provider-aware full-text search routing with explicit FTS provider selection. Database adapters can declare their own FTS support status and reason, users can choose either the database-provided provider or an external provider, and collection search now returns standardized errors when the selected backend/provider is unavailable.
