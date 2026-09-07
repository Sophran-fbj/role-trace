# ApplyLens

ApplyLens turns a job description and source-backed career evidence into an auditable application decision. It is intentionally not an ATS score, hiring-probability predictor, resume writer, application bot, RAG system, or agent.

## Start locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The sample flow works without an API key and saves its sample profile/report only in browser localStorage.

## Environment

Copy `.env.example` to `.env.local` when enabling the server-side OpenAI pipeline:

```bash
OPENAI_API_KEY=...
OPENAI_MODEL=...
```

Never expose the key to the browser. API requests use the Responses API with `store: false`, structured output, no tools, and explicit untrusted-data instructions.

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
