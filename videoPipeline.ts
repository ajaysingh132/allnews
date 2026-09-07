// services/videoPipeline.ts — Interview → Multi-Content Pipeline

import { PrismaClient } from "@prisma/client";
import Anthropic from "@anthropic-ai/sdk";

const prisma = new PrismaClient();
const claude = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────
type TranscriptSegment = {
  start: number; // seconds
  end: number;
  speaker: string;
  text: string;
};

type VideoAnalysis = {
  topicSegments: Array<{
    title: string;
    startSec: number;
    endSec: number;
    summary: string;
    clipWorthy: boolean;
  }>;
  keyQuotes: Array<{
    text: string;
    speaker: string;
    startSec: number;
    impact: "high" | "medium" | "low";
  }>;
  articleOutline: {
    titleHi: string;
    subtitle: string;
    summary: string;
    sections: string[];
  };
  shortClips: Array<{
    title: string;
    startSec: number;
    endSec: number;
    hookLine: string;
    platform: string;
  }>;
  youtubeChapters: string[];
  thumbnailTextOptions: string[];
  seoTitle: string;
  seoDescription: string;
  socialPosts: {
    xTwitter: string;
    instagram: string;
    telegram: string;
    youtube: string;
  };
  factSheet: {
    verifiedFacts: string[];
    claims: string[];
  };
};

// ─────────────────────────────────────────────────────────
// Step 1: Transcribe video (Whisper API)
// ─────────────────────────────────────────────────────────
export async function transcribeVideo(videoId: string, audioUrl: string): Promise<{
  fullText: string;
  segments: TranscriptSegment[];
}> {
  // In production: download audio, send to Whisper
  // const audioBlob = await fetch(audioUrl).then(r => r.blob())
  // const formData = new FormData()
  // formData.append('file', audioBlob, 'audio.mp3')
  // formData.append('model', 'whisper-1')
  // formData.append('language', 'hi')
  // formData.append('response_format', 'verbose_json')
  //
  // const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
  //   method: 'POST',
  //   headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
  //   body: formData,
  // })
  // const data = await res.json()
  // const segments = data.segments.map(s => ({
  //   start: s.start, end: s.end, speaker: 'Unknown', text: s.text,
  // }))

  // Mock for development
  const mockSegments: TranscriptSegment[] = [
    { start: 0, end: 45, speaker: "Host", text: "आज हम चुनावी बॉन्ड के बारे में बात करेंगे।" },
    { start: 45, end: 180, speaker: "Guest", text: "चुनावी बॉन्ड योजना 2018 में शुरू हुई थी।" },
    { start: 180, end: 360, speaker: "Guest", text: "सुप्रीम कोर्ट ने इसे असंवैधानिक घोषित किया।" },
  ];
  const fullText = mockSegments.map((s) => `[${s.speaker}]: ${s.text}`).join("\n");

  // Save to DB
  await prisma.transcript.create({
    data: {
      videoId,
      content: fullText,
      language: "hi",
      isAiGenerated: true,
    },
  });

  console.log(`✅ Transcribed: ${videoId}`);
  return { fullText, segments: mockSegments };
}

// ─────────────────────────────────────────────────────────
// Step 2: AI Analysis — extract all content from transcript
// ─────────────────────────────────────────────────────────
export async function analyzeTranscript(
  transcript: string,
  videoTitle: string,
  durationMins: number,
  articleUrl: string
): Promise<VideoAnalysis> {
  const res = await claude.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    system: `आप एक Content Producer और Video Editor हैं।
Interview transcript से maximum content निकालें।
ONLY valid JSON उत्तर दें।
Format:
{
  "topicSegments": [{"title":"","startSec":0,"endSec":60,"summary":"","clipWorthy":true}],
  "keyQuotes": [{"text":"","speaker":"","startSec":0,"impact":"high"}],
  "articleOutline": {"titleHi":"","subtitle":"","summary":"","sections":[""]},
  "shortClips": [{"title":"","startSec":0,"endSec":60,"hookLine":"","platform":"instagram|youtube|x"}],
  "youtubeChapters": ["00:00 परिचय","05:30 मुख्य विषय"],
  "thumbnailTextOptions": ["text1","text2","text3"],
  "seoTitle": "",
  "seoDescription": "",
  "socialPosts": {"xTwitter":"","instagram":"","telegram":"","youtube":""},
  "factSheet": {"verifiedFacts":[""],"claims":[""]}
}`,
    messages: [
      {
        role: "user",
        content: `Video: "${videoTitle}" (${durationMins} minutes)
URL: ${articleUrl}
Transcript:
${transcript.slice(0, 6000)}

इस interview से maximum content निकालें।`,
      },
    ],
  });

  const text = (res.content[0] as { text: string }).text;
  const clean = text.replace(/```json\n?|\n?```/g, "").trim();
  return JSON.parse(clean) as VideoAnalysis;
}

// ─────────────────────────────────────────────────────────
// Step 3: Create video clips in DB
// ─────────────────────────────────────────────────────────
export async function createClipsFromAnalysis(
  videoId: string,
  analysis: VideoAnalysis
): Promise<void> {
  // Save topic-wise clips
  for (const clip of analysis.shortClips) {
    await prisma.videoClip.create({
      data: {
        videoId,
        titleHi: clip.title,
        startSecs: clip.startSec,
        endSecs: clip.endSec,
        topic: clip.hookLine,
        isShort: clip.endSec - clip.startSec <= 60,
      },
    });
  }
  console.log(`✅ Created ${analysis.shortClips.length} clips for video ${videoId}`);
}

// ─────────────────────────────────────────────────────────
// Step 4: Generate article from interview
// ─────────────────────────────────────────────────────────
export async function generateArticleFromVideo(
  videoId: string,
  analysis: VideoAnalysis,
  authorId: string
): Promise<string> {
  const slugify = (text: string) =>
    text.toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 80) +
    "-" + Date.now();

  const article = await prisma.article.create({
    data: {
      titleHi: analysis.articleOutline.titleHi,
      subtitle: analysis.articleOutline.subtitle,
      summary: analysis.articleOutline.summary,
      slug: slugify(analysis.articleOutline.titleHi),
      body: analysis.articleOutline.sections.join("\n\n"),
      contentType: "interview",
      status: "ai_generated",
      isAiAssisted: true,
      aiDisclosureNote: "यह लेख AI द्वारा interview transcript से generate किया गया है। Human review आवश्यक है।",
      seoTitle: analysis.seoTitle,
      seoDescription: analysis.seoDescription,
      createdBy: authorId,
      updatedBy: authorId,
      authors: { create: [{ userId: authorId, role: "author" }] },
    },
  });

  // Save claims from factSheet
  for (const claim of analysis.factSheet.claims) {
    await prisma.claim.create({
      data: {
        articleId: article.id,
        claimText: claim,
        classification: "claim",
      },
    });
  }
  for (const fact of analysis.factSheet.verifiedFacts) {
    await prisma.claim.create({
      data: {
        articleId: article.id,
        claimText: fact,
        classification: "fact",
      },
    });
  }

  console.log(`✅ Article created from video: ${article.id}`);
  return article.id;
}

// ─────────────────────────────────────────────────────────
// Step 5: Generate social posts from video
// ─────────────────────────────────────────────────────────
export async function generateSocialPostsFromVideo(
  videoId: string,
  analysis: VideoAnalysis,
  articleUrl: string
): Promise<void> {
  // Get connected accounts
  const accounts = await prisma.socialAccount.findMany({
    where: { isActive: true },
  });

  const platformMap: Record<string, string> = {
    x_twitter: analysis.socialPosts.xTwitter,
    instagram: analysis.socialPosts.instagram,
    telegram: analysis.socialPosts.telegram,
    youtube: analysis.socialPosts.youtube,
  };

  for (const account of accounts) {
    const content = platformMap[account.platform];
    if (!content) continue;

    await prisma.socialPost.create({
      data: {
        videoId,
        accountId: account.id,
        platform: account.platform,
        content: content + `\n\n🔗 ${articleUrl}`,
        status: "ai_generated",
        isAiGenerated: true,
      },
    });
  }

  console.log(`✅ Social posts created for video ${videoId}`);
}

// ─────────────────────────────────────────────────────────
// MASTER PIPELINE — One function to process entire video
// ─────────────────────────────────────────────────────────
export async function runFullVideoPipeline(opts: {
  videoId: string;
  audioUrl: string;
  videoTitle: string;
  durationMins: number;
  authorId: string;
  websiteBaseUrl?: string;
}): Promise<{
  transcriptSaved: boolean;
  clipsCreated: number;
  articleId: string;
  socialPostsCreated: boolean;
  youtubeChapters: string[];
  thumbnailOptions: string[];
}> {
  const base = opts.websiteBaseUrl || "https://gyanvarta.in";
  const articleUrl = `${base}/video/${opts.videoId}`;

  console.log(`🎬 Pipeline starting for: ${opts.videoTitle}`);

  // 1. Transcribe
  const { fullText } = await transcribeVideo(opts.videoId, opts.audioUrl);

  // 2. AI Analysis
  const analysis = await analyzeTranscript(
    fullText,
    opts.videoTitle,
    opts.durationMins,
    articleUrl
  );

  // 3. Clips
  await createClipsFromAnalysis(opts.videoId, analysis);

  // 4. Article
  const articleId = await generateArticleFromVideo(
    opts.videoId,
    analysis,
    opts.authorId
  );

  // 5. Social posts
  await generateSocialPostsFromVideo(opts.videoId, analysis, articleUrl);

  // 6. Update video with YouTube chapters
  await prisma.video.update({
    where: { id: opts.videoId },
    data: { description: analysis.youtubeChapters.join("\n") },
  });

  console.log(`✅ Pipeline complete: ${opts.videoTitle}`);

  return {
    transcriptSaved: true,
    clipsCreated: analysis.shortClips.length,
    articleId,
    socialPostsCreated: true,
    youtubeChapters: analysis.youtubeChapters,
    thumbnailOptions: analysis.thumbnailTextOptions,
  };
}
