import { Router, Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { requireAiKey, authenticate, AuthRequest } from "../middleware/auth";

const router = Router();
const claude = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
const MODEL = "claude-sonnet-4-6";

// AI routes require auth + AI key check
router.use(authenticate);

// Helper: call Claude and parse JSON
async function callClaude(system: string, userMsg: string, maxTokens = 2000): Promise<unknown> {
  const res = await claude.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: userMsg }],
  });
  const text = (res.content[0] as { text: string }).text;
  // Strip markdown code fences if present
  const clean = text.replace(/```json\n?|\n?```/g, "").trim();
  return JSON.parse(clean);
}

// ── Agent 1: Research ─────────────────────────────────────
router.post("/research", async (req: AuthRequest, res: Response) => {
  const { topic, language = "hi" } = req.body;
  if (!topic) return res.status(400).json({ error: "topic required" });

  try {
    const result = await callClaude(
      `आप एक वरिष्ठ हिंदी पत्रकार और शोधकर्ता हैं।
      केवल JSON उत्तर दें — कोई preamble नहीं।
      Format: {
        "summary": "2-3 वाक्य में विषय का सारांश",
        "keyFacts": ["fact1", "fact2", ...],
        "backgroundContext": "ऐतिहासिक/राजनीतिक पृष्ठभूमि",
        "timeline": ["event1 - date", "event2 - date", ...],
        "keyPeople": ["व्यक्ति और उनकी भूमिका"],
        "keyOrganizations": ["संस्था और उनकी भूमिका"],
        "suggestedSources": ["स्रोत प्रकार और खोज सुझाव"],
        "controversies": ["विवाद और असहमति के बिंदु"],
        "potentialInterviewQuestions": ["प्रश्न1", "प्रश्न2", ...]
      }`,
      `Topic: "${topic}"`
    );
    res.json({ success: true, data: result, agent: "research" });
  } catch (err) {
    res.status(500).json({ error: "Research agent failed", detail: String(err) });
  }
});

// ── Agent 2: Article Draft ────────────────────────────────
router.post("/draft", async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    topic: z.string(),
    researchData: z.object({}).passthrough().optional(),
    contentType: z.string().default("article"),
    tone: z.string().default("analytical"),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const { topic, researchData, contentType, tone } = parsed.data;

  try {
    const result = await callClaude(
      `आप एक वरिष्ठ हिंदी पत्रकार हैं।
      Article structure का पालन करें:
      1. Headline (शीर्षक)
      2. Subheadline
      3. Summary (100 शब्द)
      4. क्या हुआ? (What Happened)
      5. हम क्या जानते हैं? (What We Know)
      6. क्या दावे किए जा रहे हैं? (What Is Claimed)
      7. क्या सत्यापित है? (What Is Verified)
      8. पृष्ठभूमि (Background)
      9. विश्लेषण (Analysis)
      10. इसका क्या अर्थ है? (What It Means)
      11. संभावित परिणाम (Possible Consequences)
      12. आगे क्या? (What Happens Next)
      
      CRITICAL: अनुमान को FACT न कहें। दावे को CLAIM tag करें।
      केवल JSON उत्तर दें:
      {
        "titleHi": "...", "subtitle": "...", "summary": "...",
        "body": "complete article body in Hindi",
        "isAiAssisted": true,
        "aiDisclosureNote": "यह लेख AI-सहायता से तैयार किया गया। मानव संपादक द्वारा समीक्षा आवश्यक।",
        "claims": [{"text":"...","classification":"claim|fact|official_statement"}],
        "suggestedImages": ["image description 1", "image description 2"],
        "relatedTopics": ["topic1", "topic2"]
      }`,
      `Type: ${contentType}\nTone: ${tone}\nTopic: "${topic}"\nResearch: ${JSON.stringify(researchData || {})}`,
      4000
    );
    res.json({ success: true, data: result, agent: "draft", warning: "HUMAN REVIEW REQUIRED before publishing" });
  } catch (err) {
    res.status(500).json({ error: "Draft agent failed", detail: String(err) });
  }
});

// ── Agent 3: Fact Check ───────────────────────────────────
router.post("/fact-check", async (req: AuthRequest, res: Response) => {
  const { claim, context, madeBy } = req.body;
  if (!claim) return res.status(400).json({ error: "claim required" });

  try {
    const result = await callClaude(
      `आप एक तथ्य-जाँचकर्ता हैं। दावे का निष्पक्ष विश्लेषण करें।
      CRITICAL: केवल documented evidence पर "fact" verdict दें।
      सिर्फ JSON उत्तर दें:
      {
        "classification": "fact|claim|unverified|false|misleading|partially_true",
        "verdict": "एक वाक्य में निर्णय",
        "verdictDetail": "विस्तृत विवरण",
        "evidence": ["साक्ष्य1", "साक्ष्य2"],
        "counterEvidence": ["प्रति-साक्ष्य1"],
        "confidence": 0.0-1.0,
        "suggestedSources": ["स्रोत जहाँ जाँच हो सकती है"],
        "bothSides": {
          "supporting": "दावे का समर्थन करने वाला",
          "opposing": "दावे का विरोध करने वाला"
        }
      }`,
      `Claim: "${claim}"\nContext: "${context || ""}"\nMade by: "${madeBy || "Unknown"}"`
    );
    res.json({ success: true, data: result, agent: "fact-check" });
  } catch (err) {
    res.status(500).json({ error: "Fact check agent failed" });
  }
});

// ── Agent 4: Social Media Generator ──────────────────────
router.post("/social-generate", async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    titleHi: z.string(),
    summary: z.string(),
    slug: z.string(),
    category: z.string(),
    keyPoints: z.array(z.string()).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const { titleHi, summary, slug, category, keyPoints } = parsed.data;
  const url = `https://gyanvarta.in/${category}/${slug}`;

  try {
    const result = await callClaude(
      `आप एक Social Media Expert हैं। हर platform के लिए NATIVE writing करें।
      Copy-paste PROHIBITED — हर platform की अपनी भाषा हो।
      Primary goal: Trust, Discovery, Website Traffic — likes नहीं।
      हर post में website URL शामिल करें।
      JSON format:
      {
        "x_twitter": {"post": "280 chars", "thread": ["tweet1","tweet2","tweet3"]},
        "facebook": {"post": "detailed, conversational"},
        "instagram": {"caption": "visual, hashtags", "reelScript": "60 sec script"},
        "linkedin": {"post": "professional tone"},
        "telegram": {"post": "informative, can be longer"},
        "whatsapp": {"post": "concise, personal tone"},
        "threads": {"post": "conversational"},
        "youtube": {"communityPost": "...", "shortScript": "60 sec script"},
        "pushNotification": "max 50 chars",
        "newsletterSummary": "2-3 sentences"
      }`,
      `Title: "${titleHi}"\nSummary: ${summary}\nURL: ${url}\nKey Points: ${JSON.stringify(keyPoints || [])}`,
      3000
    );
    res.json({ success: true, data: result, agent: "social-generate", url });
  } catch (err) {
    res.status(500).json({ error: "Social generator failed" });
  }
});

// ── Agent 5: SEO Optimizer ────────────────────────────────
router.post("/seo", async (req: AuthRequest, res: Response) => {
  const { titleHi, body, category } = req.body;
  if (!titleHi || !body) return res.status(400).json({ error: "titleHi and body required" });

  const wordCount = body.split(/\s+/).length;

  try {
    const result = await callClaude(
      `आप एक Hindi SEO Expert हैं। NewsArticle schema.org generate करें।
      Hindi search optimization focus करें।
      JSON format:
      {
        "seoTitle": "60 chars max, keyword-rich",
        "metaDescription": "155 chars max",
        "keywords": ["keyword1","keyword2",...10 keywords],
        "slug": "url-friendly-hindi-slug",
        "schemaMarkup": {"@context":"https://schema.org","@type":"NewsArticle",...},
        "openGraphTitle": "...",
        "openGraphDescription": "...",
        "readingTimeMinutes": ${Math.max(1, Math.ceil(wordCount / 150))},
        "headlineTags": ["H2 suggestion1", "H2 suggestion2"],
        "internalLinkSuggestions": ["topic to link to"]
      }`,
      `Title: ${titleHi}\nCategory: ${category}\nBody (first 600 chars): ${body.slice(0, 600)}`
    );
    res.json({ success: true, data: result, agent: "seo" });
  } catch (err) {
    res.status(500).json({ error: "SEO agent failed" });
  }
});

// ── Agent 6: Interview Question Generator ────────────────
router.post("/interview-prep", async (req: AuthRequest, res: Response) => {
  const { personName, topic, previousStatements } = req.body;
  if (!personName || !topic) return res.status(400).json({ error: "personName and topic required" });

  try {
    const result = await callClaude(
      `आप एक वरिष्ठ पत्रकार हैं जो interview तैयार कर रहे हैं।
      JSON format:
      {
        "openingQuestions": ["प्रश्न1",...],
        "challengingQuestions": ["कठिन प्रश्न",...],
        "documentBasedQuestions": ["दस्तावेज़ आधारित",...],
        "followUpSuggestions": ["follow-up",...],
        "topicsToExplore": ["विषय1",...],
        "claimsToVerify": ["सत्यापन योग्य दावे"],
        "redFlags": ["सावधानी के बिंदु"],
        "backgroundBrief": "5-6 lines about person"
      }`,
      `Person: "${personName}"\nTopic: "${topic}"\nPrevious statements: "${previousStatements || "N/A"}"`
    );
    res.json({ success: true, data: result, agent: "interview-prep" });
  } catch (err) {
    res.status(500).json({ error: "Interview prep agent failed" });
  }
});

// ── Agent 7: Video to Content Pipeline ───────────────────
router.post("/video-pipeline", async (req: AuthRequest, res: Response) => {
  const { transcript, videoTitle, duration } = req.body;
  if (!transcript) return res.status(400).json({ error: "transcript required" });

  try {
    const result = await callClaude(
      `आप एक Content Producer हैं। Transcript से multiple content formats बनाएं।
      JSON format:
      {
        "topicSegments": [{"title":"...","startMin":0,"endMin":5,"summary":"..."},...],
        "keyQuotes": [{"quote":"...","speaker":"...","context":"..."},...],
        "articleOutline": {"titleHi":"...","sections":["..."]},
        "shortClipSuggestions": [{"title":"...","startMin":0,"endMin":1,"hookLine":"..."},...],
        "factSheet": {"verifiedFacts":["..."],"claims":["..."]},
        "socialQuotes": {"xTwitter":"...","instagram":"..."},
        "youtubeChapters": ["00:00 Chapter1","05:30 Chapter2",...],
        "thumbnailTextSuggestions": ["text1","text2","text3"],
        "researchQuestions": ["शोध के लिए प्रश्न"]
      }`,
      `Video: "${videoTitle}" (${duration} mins)\nTranscript: ${transcript.slice(0, 4000)}`,
      3000
    );
    res.json({ success: true, data: result, agent: "video-pipeline" });
  } catch (err) {
    res.status(500).json({ error: "Video pipeline agent failed" });
  }
});

// ── Agent 8: Weekly Analytics Report ─────────────────────
router.post("/weekly-report", async (req: AuthRequest, res: Response) => {
  const { topArticles, socialMetrics, videoMetrics, period } = req.body;

  try {
    const result = await callClaude(
      `आप एक Media Analytics Expert हैं। Data से actionable editorial insights दें।
      JSON format:
      {
        "executiveSummary": "3-4 sentences",
        "topPerformingTopics": ["topic - reason"],
        "underperformingTopics": ["topic - reason"],
        "audienceInsights": ["insight1","insight2"],
        "editorialRecommendations": ["सुझाव1","सुझाव2","सुझाव3"],
        "socialRecommendations": ["सुझाव1","सुझाव2"],
        "videoRecommendations": ["सुझाव1","सुझाव2"],
        "researchOpportunities": ["शोध के अवसर"],
        "nextWeekFocus": ["priority1","priority2","priority3"],
        "riskAlerts": ["चेतावनी1","चेतावनी2"]
      }`,
      `Period: ${period || "last 7 days"}\nTop Articles: ${JSON.stringify(topArticles || [])}\nSocial: ${JSON.stringify(socialMetrics || {})}\nVideo: ${JSON.stringify(videoMetrics || {})}`,
      2000
    );
    res.json({ success: true, data: result, agent: "weekly-report" });
  } catch (err) {
    res.status(500).json({ error: "Weekly report agent failed" });
  }
});

// ── Agent 9: Knowledge Extraction ────────────────────────
router.post("/knowledge-extract", async (req: AuthRequest, res: Response) => {
  const { articleBody } = req.body;
  if (!articleBody) return res.status(400).json({ error: "articleBody required" });

  try {
    const result = await callClaude(
      `Article से Knowledge Core entities extract करें।
      JSON format:
      {
        "people": [{"name":"...","role":"...","context":"..."}],
        "organizations": [{"name":"...","type":"..."}],
        "events": [{"name":"...","date":"...","location":"..."}],
        "places": [{"name":"...","type":"..."}],
        "laws": [{"name":"...","number":"...","year":""}],
        "policies": [{"name":"...","issuedBy":"..."}],
        "claims": [{"text":"...","madeBy":"...","classification":"claim|fact|official_statement"}],
        "relationships": [{"from":"entity","to":"entity","relation":"..."}]
      }`,
      `Article (first 3000 chars): ${articleBody.slice(0, 3000)}`
    );
    res.json({ success: true, data: result, agent: "knowledge-extract" });
  } catch (err) {
    res.status(500).json({ error: "Knowledge extraction failed" });
  }
});

// ── Agent 10: Book Chapter Mapper ─────────────────────────
router.post("/book-mapper", async (req: AuthRequest, res: Response) => {
  const { articleIds, bookTitle, researchNotes } = req.body;

  try {
    const result = await callClaude(
      `आप एक Academic Editor हैं। Articles को book chapters में organize करें।
      JSON format:
      {
        "bookOutline": {
          "title": "...",
          "subtitle": "...",
          "introduction": "...",
          "chapters": [{"number":1,"title":"...","articles":[],"keyArguments":["..."],"researchGaps":["..."]}]
        },
        "thesisStatement": "...",
        "researchGaps": ["अनुत्तरित प्रश्न"],
        "citationSuggestions": ["...", "..."],
        "publishingNotes": "KDP/Payhip के लिए सुझाव"
      }`,
      `Book: "${bookTitle}"\nArticle IDs: ${JSON.stringify(articleIds || [])}\nNotes: ${researchNotes || ""}`
    );
    res.json({ success: true, data: result, agent: "book-mapper" });
  } catch (err) {
    res.status(500).json({ error: "Book mapper failed" });
  }
});

export { router as aiRouter };
