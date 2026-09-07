import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { authenticate, requirePermission, AuthRequest } from "../middleware/auth";
import { runFullVideoPipeline, transcribeVideo } from "../services/videoPipeline";

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// ── Create Video Entry ────────────────────────────────────
router.post("/", async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    titleHi: z.string().min(3),
    titleEn: z.string().optional(),
    description: z.string().optional(),
    programId: z.string().uuid().optional(),
    videoUrl: z.string().url().optional(),
    youtubeId: z.string().optional(),
    durationSecs: z.number().optional(),
    thumbnailUrl: z.string().url().optional(),
    articleId: z.string().uuid().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Validation failed", details: parsed.error.errors });

  const slug =
    parsed.data.titleHi
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 80) +
    "-" + Date.now();

  const video = await prisma.video.create({
    data: { ...parsed.data, slug, status: "draft", uploadedBy: req.user!.id },
  });

  res.status(201).json(video);
});

// ── List Videos ───────────────────────────────────────────
router.get("/", async (req: AuthRequest, res: Response) => {
  const { status, program, page = "1" } = req.query;
  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (program) where.programId = program;

  const [videos, total] = await Promise.all([
    prisma.video.findMany({
      where,
      include: {
        program: { select: { nameHi: true } },
        _count: { select: { clips: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (parseInt(page as string) - 1) * 20,
      take: 20,
    }),
    prisma.video.count({ where }),
  ]);

  res.json({ videos, total });
});

// ── Trigger Full Pipeline ─────────────────────────────────
router.post("/:id/pipeline", requirePermission("article:create"),
  async (req: AuthRequest, res: Response) => {
    const video = await prisma.video.findUnique({ where: { id: req.params.id } });
    if (!video) return res.status(404).json({ error: "Video not found" });

    if (!video.videoUrl && !video.youtubeId) {
      return res.status(400).json({ error: "Video URL or YouTube ID required for pipeline" });
    }

    // Run pipeline async
    res.json({ message: "Pipeline started", videoId: video.id, status: "processing" });

    try {
      const result = await runFullVideoPipeline({
        videoId: video.id,
        audioUrl: video.videoUrl || `https://youtube.com/watch?v=${video.youtubeId}`,
        videoTitle: video.titleHi,
        durationMins: Math.ceil((video.durationSecs || 0) / 60),
        authorId: req.user!.id,
        websiteBaseUrl: process.env.WEBSITE_BASE_URL,
      });

      await prisma.video.update({
        where: { id: video.id },
        data: { status: "approved" },
      });

      console.log(`Pipeline complete for ${video.titleHi}:`, result);
    } catch (err) {
      console.error("Pipeline error:", err);
      await prisma.video.update({
        where: { id: video.id },
        data: { status: "draft" },
      });
    }
  }
);

// ── Transcribe Only ───────────────────────────────────────
router.post("/:id/transcribe", requirePermission("article:create"),
  async (req: AuthRequest, res: Response) => {
    const video = await prisma.video.findUnique({ where: { id: req.params.id } });
    if (!video) return res.status(404).json({ error: "Video not found" });

    const { audioUrl } = req.body;
    if (!audioUrl) return res.status(400).json({ error: "audioUrl required" });

    res.json({ message: "Transcription started" });
    await transcribeVideo(video.id, audioUrl);
  }
);

// ── Get Transcript ────────────────────────────────────────
router.get("/:id/transcript", async (req: AuthRequest, res: Response) => {
  const transcript = await prisma.transcript.findFirst({
    where: { videoId: req.params.id },
    orderBy: { createdAt: "desc" },
  });

  if (!transcript) return res.status(404).json({ error: "Transcript not found" });
  res.json(transcript);
});

// ── List Clips ────────────────────────────────────────────
router.get("/:id/clips", async (req: AuthRequest, res: Response) => {
  const clips = await prisma.videoClip.findMany({
    where: { videoId: req.params.id },
    orderBy: { startSecs: "asc" },
  });
  res.json(clips);
});

// ── Publish Video ─────────────────────────────────────────
router.post("/:id/publish", requirePermission("article:approve"),
  async (req: AuthRequest, res: Response) => {
    const updated = await prisma.video.update({
      where: { id: req.params.id },
      data: { status: "published", publishedAt: new Date() },
    });
    res.json({ message: "Video published", video: updated });
  }
);

export { router as videosRouter };
