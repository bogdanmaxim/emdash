---
"emdash": minor
---

Adds backend-aware full-text search support for libSQL and Turso databases while preserving SQLite FTS5 as the default implementation. Collection search selects the correct index strategy based on the active backend and returns clear errors when a target database does not support the required search capabilities.
