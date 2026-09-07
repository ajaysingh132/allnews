# ALL NEWS — STEP 8.2 Source Discovery

## लक्ष्य

Step 8.1 के Source Registry + Evidence Layer को वास्तविक discovery path से जोड़ना।

### इस चरण के बाद

`topic → multiple source providers → normalized evidence → dedupe → ResearchEngine`

यह चरण AI से तथ्य बनवाने के बजाय वास्तविक provider-returned records को Research Engine तक पहुँचाता है।

## फाइलें

- `source-discovery-provider.ts`
- `source-normalizer.ts`
- `source-discovery-http.ts`
- `research-engine-wiring.ts`
- `truth-research-route-example.ts`
- `source-discovery.test.ts`

इन फाइलों को उसी backend source directory में रखें जहाँ वर्तमान:
- `research-engine.ts`
- `all-news-editorial-core.ts`
- `source-registry.ts`
- `source-normalizer.ts` (यदि पहले से मौजूद हो)

**महत्वपूर्ण:** यदि Step 8.1 में `source-normalizer.ts` पहले से मौजूद है, तो उसे overwrite न करें। केवल duplicate type/function names को merge करें।

## Provider configuration

हर provider का endpoint और credential environment variable से दें।

उदाहरण:

`ALL_NEWS_DISCOVERY_ENDPOINT`
`ALL_NEWS_DISCOVERY_TOKEN`

किसी API key/token को source code में hard-code न करें।

## API Setu / OGD

API Setu का generic search endpoint अनुमान से hard-code नहीं करना है। जिस API/provider की subscription/access मिली है, उसी का documented endpoint adapter में configure करें।

OGD India के लिए भी वास्तविक resource ID और API key मिलने पर अलग provider adapter लगाएँ।

## Research route

मौजूदा `/ai` architecture में नया route जोड़ते समय existing authentication middleware और permission checks बनाए रखें।

Route का परिणाम हमेशा:

- `humanReviewRequired: true`
- `autoPublish: false`

रहेगा।

## क्या नहीं करना है

- LLM-generated URL को evidence न मानें।
- मॉडल से source/quote/fact invent न करवाएँ।
- source discovery failure को `evidence_ready` न बनाएं।
- एक provider fail होने पर दूसरे providers के valid evidence को discard न करें।
- AI को सीधे publish permission न दें।

## Step 8.3

अगले चरण में ResearchEngine के खाली:
- claims
- perspectives
- timeline
- contradictions

को वास्तविक evidence से भरने के लिए evidence-to-claim extraction और cross-source comparison जोड़ना है। उस चरण में भी हर claim को `evidenceIds` से traceable रखना अनिवार्य होगा।
