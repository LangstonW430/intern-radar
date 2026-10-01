# intern-radar-ml

The GitHub Actions job: fetches job descriptions from ATS endpoints and embeds
listings and resumes with `BAAI/bge-small-en-v1.5` (the embedding feature is
optional and off by default; matching itself is the keyword-weight model in
Convex). Talks to Convex through the shared-secret export/import HTTP
endpoints only.

```sh
uv sync
uv run pytest
```
