# ApplyLens

ApplyLens turns a job description and source-backed career evidence into an auditable application decision. It is intentionally not an ATS score, hiring-probability predictor, resume writer, application bot, RAG system, or agent.

## Start locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The sample flow works without an API key and saves its sample profile/report only in browser localStorage.

## Local data backup

From **Applications / 求职记录**, export a JSON backup of your real Profile, analyses, and tracked application states. Importing a backup is validated locally, previewed before confirmation, and replaces the current browser data only after confirmation. Backup files never include API keys, environment variables, or Sample Mode fixtures.

## Environment

Copy `.env.example` to `.env.local` when enabling a server-side provider. `AI_PROVIDER` is optional and defaults to `openai`.

For OpenAI:

```bash
AI_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_MODEL=...
```

For DeepSeek:

```bash
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=...
DEEPSEEK_MODEL=deepseek-v4-flash
# Optional; this is the default.
DEEPSEEK_BASE_URL=https://api.deepseek.com
# Optional; none disables DeepSeek thinking for lower latency.
DEEPSEEK_REASONING_EFFORT=none
```

Both providers accept `AI_TIMEOUT_MS` (default `20000`). Never expose a key to the browser. OpenAI uses the SDK's Responses structured-output helper. DeepSeek uses its documented Responses API `json_schema` format, then parses the response text and validates it with the same Zod schema. Both paths use `store: false`, no tools, and explicit untrusted-data instructions. ApplyLens logs only server-side stage durations for JD analysis; logs never include source material, model output, or credentials.

## Grounding architecture

1. Ordinary code creates stable source blocks from user text.
2. The model may propose evidence, requirements, and matches only with pre-existing block/evidence IDs.
3. Code validates every ID and exact quote before persisting or showing it.
4. A `strong_match` needs direct evidence; a `partial_match` needs some evidence. Invalid output is downgraded or rejected.
5. A deterministic rule module—not the model—chooses Apply, Consider, Skip, or Need More Information.

This reduces unsupported claims but does not claim to eliminate hallucinations. Users can review, correct, verify, or exclude extracted evidence.

## Verification

```bash
npm test
npm run lint
npm run build
```
