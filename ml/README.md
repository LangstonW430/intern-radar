# intern-radar-ml

The GitHub Actions job: fetches job descriptions from ATS endpoints, embeds
listings and resumes with `BAAI/bge-small-en-v1.5`, and trains the global +
per-user logistic-regression models. Talks to Convex through the shared-secret
export/import HTTP endpoints only.

```sh
uv sync
uv run pytest
```
