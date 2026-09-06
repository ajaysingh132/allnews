// AI Agents Architecture — ज्ञानवार्ता
// LangChain + Claude API based agent system

import Anthropic from "@anthropic-ai/sdk";

const claude = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
const MODEL = "claude-sonnet-4-6";

// ─────────────────────────────────────────────
// Agent 1: Research Agent
// ─────────────────────────────────────────────
export async function researchAgent(topic: string): Promise<{
  summary: string;
  keyFacts: string[];
  suggestedSources: string[];
  backgroundContext: string;
  timeline: string[];
}> {
  const res = await claude.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: `आप एक वरिष्ठ शोधकर्ता हैं। केवल JSON में उत्तर दें।
    Format: { summary, keyFacts[], suggestedSources[], backgroundContext, timeline[] }`,
    messages: [{ role: "user", content: `Topic: "${topic}" पर गहन शोध करें।` }],
  });
  return JSON.parse((res.content[0] as { text: string }).text);
}

// ─────────────────────────────────────────────
// Agent 2: Article Draft Agent
// ─────────────────────────────────────────────
export async function articleDraftAgent(input: {
  topic: string;
  researchData: object;
  articleType: string;
}): Promise<{
  titleHi: string;
  subtitle: string;
  summary: string;
  body: string;
  seoTitle: string;
  seoDescription: string;
}> {
  const res = await claude.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: `आप एक वरिष्ठ हिंदी पत्रकार हैं। 
    Article structure: Headline, Subheadline, Summary, What Happened, Background, Analysis, Consequences, What Next.
    केवल JSON उत्तर दें। AI disclosure: हमेशा is_ai_assisted: true रखें।`,
    messages: [
      {
        role: "user",
        content: `Type: ${input.articleType}\nTopic: ${input.topic}\nResearch: ${JSON.stringify(input.researchData)}`,
      },
    ],
  });
  return JSON.parse((res.content[0] as { text: string }).text);
}

// ─────────────────────────────────────────────
// Agent 3: Fact Check Agent
// ─────────────────────────────────────────────
export async function factCheckAgent(claim: string, context: string): Promise<{
  classification: "fact" | "claim" | "unverified" | "false" | "misleading";
  verdict: string;
  evidence: string[];
  confidence: number;
  suggestedSources: string[];
}> {
  const res = await claude.messages.create({
    model: MODEL,
    max_tokens: 1000,
    system: `आप एक तथ्य-जाँचकर्ता हैं। ONLY JSON।
    CRITICAL: कभी अनुमान को FACT न कहें। केवल documented evidence पर FACT लगाएं।`,
    messages: [
      { role: "user", content: `Claim: "${claim}"\nContext: "${context}"` },
    ],
  });
  return JSON.parse((res.content[0] as { text: string }).text);
}

// ─────────────────────────────────────────────
// Agent 4: Social Media Generator
// ─────────────────────────────────────────────
export async function socialMediaAgent(article: {
  titleHi: string;
  summary: string;
  slug: string;
  category: string;
}): Promise<{
  xPost: string;
  xThread: string[];
  facebookPost: string;
  instagramCaption: string;
  instagramReelScript: string;
  linkedinPost: string;
  telegramPost: string;
  whatsappPost: string;
  threadsPost: string;
  youtubeCommunityPost: string;
  youtubeShortScript: string;
  pushNotification: string;
  newsletterSummary: string;
}> {
  const websiteUrl = `https://gyanvarta.in/${article.category}/${article.slug}`;
  const res = await claude.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: `आप एक Social Media Expert हैं। हर platform के लिए native writing करें — copy-paste नहीं।
    हर post में website URL शामिल करें: ${websiteUrl}
    Primary goal: Trust, Discovery, Website Traffic — केवल likes नहीं।
    ONLY JSON उत्तर दें।`,
    messages: [
      {
        role: "user",
        content: `Article: "${article.titleHi}"\nSummary: ${article.summary}`,
      },
    ],
  });
  return JSON.parse((res.content[0] as { text: string }).text);
}

// ─────────────────────────────────────────────
// Agent 5: SEO Agent
// ─────────────────────────────────────────────
export async function seoAgent(article: {
  titleHi: string;
  body: string;
  category: string;
}): Promise<{
  seoTitle: string;
  metaDescription: string;
  keywords: string[];
  slug: string;
  schemaMarkup: object;
  openGraphTitle: string;
  openGraphDescription: string;
  readingTimeMinutes: number;
}> {
  const res = await claude.messages.create({
    model: MODEL,
    max_tokens: 1000,
    system: `आप Hindi SEO Expert हैं। NewsArticle schema.org markup generate करें।
    Hindi search optimization पर ध्यान दें। ONLY JSON।`,
    messages: [
      {
        role: "user",
        content: `Title: ${article.titleHi}\nCategory: ${article.category}\nBody preview: ${article.body.slice(0, 500)}`,
      },
    ],
  });
  return JSON.parse((res.content[0] as { text: string }).text);
}

// ─────────────────────────────────────────────
// Agent 6: Transcript Agent (Whisper-based)
// ─────────────────────────────────────────────
export async function transcriptAgent(audioUrl: string): Promise<{
  transcript: string;
  speakers: { id: string; segments: { start: number; end: number; text: string }[] }[];
  keyQuotes: string[];
  topicSegments: { title: string; startSec: number; endSec: number }[];
}> {
  // Whisper API transcription + Claude post-processing
  const transcriptRaw = `[Whisper API result for ${audioUrl}]`;
  const res = await claude.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: `Transcript को process करें। Speaker diarization, key quotes, topic segments निकालें। ONLY JSON।`,
    messages: [{ role: "user", content: transcriptRaw }],
  });
  return JSON.parse((res.content[0] as { text: string }).text);
}

// ─────────────────────────────────────────────
// Agent 7: Weekly Analytics Agent
// ─────────────────────────────────────────────
export async function weeklyAnalyticsAgent(data: {
  topArticles: object[];
  socialMetrics: object;
  videoMetrics: object;
  audienceData: object;
}): Promise<{
  insights: string;
  editorialRecommendations: string[];
  socialRecommendations: string[];
  videoRecommendations: string[];
  researchRecommendations: string[];
  nextWeekFocus: string[];
}> {
  const res = await claude.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: `आप एक Media Analytics Expert हैं। Data देखकर actionable insights दें।
    ONLY JSON। Hindi में recommendations।`,
    messages: [
      { role: "user", content: `Weekly Data: ${JSON.stringify(data)}` },
    ],
  });
  return JSON.parse((res.content[0] as { text: string }).text);
}

// ─────────────────────────────────────────────
// Agent 8: Knowledge Extraction Agent
// ─────────────────────────────────────────────
export async function knowledgeExtractionAgent(articleBody: string): Promise<{
  people: { name: string; role: string }[];
  organizations: { name: string; type: string }[];
  events: { name: string; date?: string }[];
  places: { name: string }[];
  laws: { name: string; number?: string }[];
  claims: { text: string; madeBy: string; classification: string }[];
}> {
  const res = await claude.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: `Article से Knowledge Core entities निकालें। ONLY JSON।`,
    messages: [
      { role: "user", content: `Article: ${articleBody.slice(0, 3000)}` },
    ],
  });
  return JSON.parse((res.content[0] as { text: string }).text);
}

// ─────────────────────────────────────────────
// Workflow Orchestrator
// ─────────────────────────────────────────────
export async function fullContentPipeline(topic: string, type: string) {
  console.log("1. Research starting...");
  const research = await researchAgent(topic);

  console.log("2. Draft generation...");
  const draft = await articleDraftAgent({ topic, researchData: research, articleType: type });

  console.log("3. SEO optimization...");
  const seo = await seoAgent({ titleHi: draft.titleHi, body: draft.body, category: type });

  // STOP — Human Review Required
  console.log("4. [HUMAN REVIEW REQUIRED] — Draft saved to CMS");
  return { research, draft: { ...draft, ...seo }, status: "pending_review" };
  // Social media generation happens AFTER human approval
}
