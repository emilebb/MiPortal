# MiPortal assistant API

The assistant is configured in `js/miportal-assistant-api.mjs` through `ASSISTANT_CONFIG`. It currently uses `mockMode: true` and an empty `endpoint`; mock mode never calls `fetch`. Its demonstration answers are isolated in `js/miportal-assistant-mock.mjs`. To connect a same-origin backend, set mock mode to false and configure its endpoint. Keep the endpoint unset until the backend is deployed.

The client sends a `POST` request with `Content-Type: application/json` and a 15-second abort timeout. No authorization, cookie, or API-key header is sent. The JSON body is `{ "message": "...", "sessionId": "...", "page": { "path": "/noticias.html", "title": "Noticias | MiPortal" } }`. The session ID exists only in page memory and is not stored.

The response must be a JSON object with a non-empty string `reply`. An optional `links` array contains objects with non-empty string `label` and string `url` fields. URLs are restricted to same-origin site paths and HTTP(S); malformed responses or links are rejected. External HTTP(S) links open in a new tab with `noopener noreferrer`. The backend should return an appropriate non-2xx status for failures.

Network errors, timeout, non-2xx responses, invalid JSON, and schema validation failures display the same Spanish fallback and a link to `/buscar.html`. Messages are limited to 1,000 characters. The current mock returns a local demonstration response and a search link without network access. A future cross-origin endpoint will also require its exact origin to be allowed by each public page's CSP `connect-src` and correctly configured backend CORS; prefer same-origin routing where available.
