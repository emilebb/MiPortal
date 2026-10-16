# MiPortal assistant API

The assistant is configured in `js/miportal-assistant-api.mjs` through `ASSISTANT_CONFIG`. It uses `mockMode: false` and the same-origin endpoint `/api/assistant`; demonstration answers remain isolated in `js/miportal-assistant-mock.mjs` and are not used.

The client sends a `POST` request with `Content-Type: application/json` and a 15-second abort timeout. Signed-in users also send the Supabase bearer token, verified on the server against Auth. Guest session IDs exist only in page memory. User IDs and roles supplied in the body are never used for authorization or quotas.

The proxy reserves quota atomically through the service-only `reserve_assistant_request` RPC. Five requests per account in a rolling 24-hour window apply equally to free, Pro and admin accounts until different product rules are approved. Guests get five per ephemeral session, with a separate IP abuse cap of 5/minute, 20/hour and 40/24 hours. Only keyed hashes and timestamps are stored; message text is not stored in this quota table. A failing quota service fails closed. Deploy migration `20261016223143_assistant_account_quota.sql` before releasing this code. The server sends `X-MiPortal-Assistant-Secret` to n8n; the secret must be at least 32 characters and is also used to derive the hashes. Rotating it resets IP/guest identity history; account history stays tied to user IDs. Verify the matching n8n Header Auth credential independently; this audit did not authenticate into n8n.

The paragraphs below are historical notes from the original repository, not findings verified in this audit:

An Upstash Redis Free database has been provisioned for the global daily model-call counter. Its `INCR` endpoint has been verified with a single test increment. In the unpublished n8n draft, the model branch is gated by a daily counter capped at 50 calls and the `gpt-4.1-mini` node is configured for a maximum of 350 output tokens. The model node has not been executed. This counter limits calls, but does not provide a contractual spend ceiling because provider billing is based on tokens.

The published workflow remains separate from this unpublished draft. No request has been sent to OpenAI. Retrieved context in the draft is capped at 5,000 characters, input at 1,000 characters, and output at 350 tokens. A rough five-turn conversation at these limits is around US$0.01, depending on actual tokenization and retrieved context. See [official GPT-4.1 mini pricing](https://developers.openai.com/api/docs/models/gpt-4.1-mini). OpenAI calls require explicit approval before the model node is executed or the workflow is published.

The response must be a JSON object with a non-empty string `reply`. An optional `links` array contains objects with non-empty string `label` and string `url` fields. URLs are restricted to same-origin site paths and HTTP(S); malformed responses or links are rejected. External HTTP(S) links open in a new tab with `noopener noreferrer`. The backend should return an appropriate non-2xx status for failures.

Network errors, timeout, non-2xx responses, invalid JSON, and schema validation failures display the same Spanish fallback and a link to `/buscar.html`. Messages are limited to 1,000 characters. The `/api/assistant` function forwards validated requests to the published n8n webhook using a same-origin route.
