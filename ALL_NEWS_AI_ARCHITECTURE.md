# ALL NEWS — AI ARCHITECTURE

## Production rule

एक newsroom = एक methodology = एक central editorial core = एक evidence protocol = एक AI router.

ChatGPT accounts production runtime नहीं हैं। अलग-अलग पत्रकारों को अलग model/personality से अलग research नहीं मिलनी चाहिए। Production requests central API/router से गुजरें।

## Pipeline

```text
Topic
  ↓
Source Discovery
  ↓
Primary Sources + Documents
  ↓
Independent Corroboration
  ↓
Claims Extraction
  ↓
Evidence / Counter-Evidence
  ↓
Perspective Mapping
  ↓
Historical Context
  ↓
Benefit / Harm / Interest Analysis
  ↓
Root-Cause Investigation — "रोड़े की खुदाई"
  ↓
All News Analysis Brief
  ↓
Human Journalist
  ↓
Human Editor
  ↓
Publish
```

## Non-negotiable boundaries

- LLM-generated citations are never accepted as evidence until retrieved and validated.
- Fact-check endpoint must consume evidence records; it must not invent evidence.
- Social publishing must remain approval-gated.
- AI output must never auto-publish.
- Every published AI-assisted item must retain audit metadata.
- Every correction must be immutable/auditable.
- Provider/model may change without changing editorial methodology.

## Provider-neutral interfaces

The research engine should expose adapters for:

- web/search provider
- government/open-data sources
- court/parliament documents
- academic/research indexes
- internal source database
- document/PDF extraction
- optional transcription provider

The adapter returns normalized `EvidenceItem` objects. The editorial layer does not care which provider supplied them.

## Evidence object minimum

```ts
{
  id,
  title,
  url,
  sourceType,
  publisher,
  publishedAt,
  retrievedAt,
  excerpt,
  supportsClaim,
  reliability
}
```

## Claim lifecycle

`extracted → source-matched → evidence-reviewed → classified → editor-reviewed → published`

## Classification

- `fact` — strong evidence and independent corroboration
- `official_statement` — attributed statement, not automatically truth
- `claim` — assertion requiring verification
- `documented_evidence` — documented support but not yet sufficient for a full fact verdict
- `unverified` — insufficient evidence
- `misleading / false / partially_true` — only after evidence-based comparison
- `analysis` — reasoned inference clearly separated from fact
- `opinion` — explicitly identified opinion

## Emergency mode

If external AI/search APIs fail, a journalist may use ChatGPT manually as an assistant. The result must still enter the same evidence and human-review workflow before publication. ChatGPT should never become the only source of truth.
