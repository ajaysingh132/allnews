import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import slugify from "slugify";
import { authenticate, requirePermission, requireSensitiveApproval, AuthRequest } from "../middleware/auth";
import { logAudit } from "../utils/audit";

const router = Router();
const prisma = new PrismaClient();

// All CMS routes require authentication
router.use(authenticate);

// ── Article Schema Validation ─────────────────────────────
const articleSchema = z.object({
  titleHi: z.string().min(5, "शीर्षक कम से कम 5 अक्षर का होना चाहिए"),
  titleEn: z.string().optional(),
  subtitle: z.string().optional(),
  summary: z.string().optional(),
  body: z.string().min(50, "सामग्री कम से कम 50 अक्षर की होनी चाहिए"),
  contentType: z.enum(["article","analysis","interview","fact_check","ground_report","explainer","opinion","special_report","research"]).optional(),
  categoryId: z.string().uuid().optional(),
  heroImageUrl: z.string().url().optional(),
  heroImageCaption: z.string().optional(),
  isSensitive: z.boolean().optional().default(false),
  isAiAssisted: z.boolean().optional().default(false),
  aiDisclosureNote: z.string().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().max(160).optional(),
  seoKeywords: z.array(z.string()).optional(),
  scheduledAt: z.string().datetime().optional(),
  tagIds: z.array(z.string().uuid()).optional(),
  authorIds: z.array(z.string().uuid()).optional(),
});

// ── List Articles (CMS) ───────────────────────────────────
router.get("/", async (req: AuthRequest, res: Response) => {
  const { status, category, page = "1", limit = "20", search } = req.query;

  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (category) where.categoryId = category;
  if (search) {
    where.titleHi = { contains: search, mode: "insensitive" };
  }

  // Reporters/Authors can only see their own articles
  const restrictedRoles = ["reporter", "author"];
  if (req.user && restrictedRoles.includes(req.user.role)) {
    where.authors = { some: { userId: req.user.id } };
  }

  const [articles, total] = await Promise.all([
    prisma.article.findMany({
      where,
      include: {
        category: { select: { nameHi: true, slug: true } },
        authors: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
        _count: { select: { pageViews: true, corrections: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip,
      take: parseInt(limit as string),
    }),
    prisma.article.count({ where }),
  ]);

  res.json({
    articles,
    pagination: {
      total,
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      totalPages: Math.ceil(total / parseInt(limit as string)),
    },
  });
});

// ── Get Single Article ────────────────────────────────────
router.get("/:id", async (req: AuthRequest, res: Response) => {
  const article = await prisma.article.findUnique({
    where: { id: req.params.id },
    include: {
      category: true,
      authors: { include: { user: { select: { id: true, name: true, avatarUrl: true, bio: true } } } },
      tags: { include: { tag: true } },
      revisions: { orderBy: { createdAt: "desc" }, take: 10 },
      corrections: { orderBy: { createdAt: "desc" } },
      claims: { include: { source: true } },
    },
  });

  if (!article) return res.status(404).json({ error: "Article not found" });
  res.json(article);
});

// ── Create Article ────────────────────────────────────────
router.post("/", requirePermission("article:create"), requireSensitiveApproval,
  async (req: AuthRequest, res: Response) => {
    const parsed = articleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.errors });
    }

    const { tagIds, authorIds, ...data } = parsed.data;

    // Generate slug
    const slug = slugify(data.titleHi, { locale: "hi", lower: true, strict: true }) +
      "-" + Date.now();

    // Estimate reading time (~150 words/min for Hindi)
    const wordCount = data.body.split(/\s+/).length;
    const readingTimeMins = Math.max(1, Math.ceil(wordCount / 150));

    const article = await prisma.article.create({
      data: {
        ...data,
        slug,
        readingTimeMins,
        createdBy: req.user!.id,
        updatedBy: req.user!.id,
        authors: {
          create: (authorIds || [req.user!.id]).map((uid) => ({
            userId: uid,
            role: uid === req.user!.id ? "author" : "contributor",
          })),
        },
        tags: tagIds
          ? { create: tagIds.map((tid) => ({ tagId: tid })) }
          : undefined,
      },
      include: {
        category: { select: { nameHi: true } },
        authors: { include: { user: { select: { name: true } } } },
      },
    });

    await logAudit(req, "article:create", "article", article.id, null, article);

    res.status(201).json(article);
  }
);

// ── Update Article ────────────────────────────────────────
router.put("/:id", requirePermission("article:create"), requireSensitiveApproval,
  async (req: AuthRequest, res: Response) => {
    const existing = await prisma.article.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Article not found" });

    const parsed = articleSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.errors });
    }

    // Save revision before update
    await prisma.articleRevision.create({
      data: {
        articleId: existing.id,
        titleHi: existing.titleHi,
        body: existing.body,
        changedBy: req.user!.id,
        changeNote: req.body.changeNote || "Manual update",
      },
    });

    const { tagIds, authorIds, ...updateData } = parsed.data;

    const updated = await prisma.article.update({
      where: { id: req.params.id },
      data: { ...updateData, updatedBy: req.user!.id },
    });

    await logAudit(req, "article:update", "article", updated.id, existing, updated);
    res.json(updated);
  }
);

// ── Submit for Review ─────────────────────────────────────
router.post("/:id/submit", async (req: AuthRequest, res: Response) => {
  const article = await prisma.article.findUnique({ where: { id: req.params.id } });
  if (!article) return res.status(404).json({ error: "Article not found" });

  if (!["draft", "ai_generated"].includes(article.status)) {
    return res.status(400).json({ error: "Only draft articles can be submitted for review" });
  }

  const newStatus = article.isSensitive ? "sensitive_review" : "editor_review";

  const updated = await prisma.article.update({
    where: { id: req.params.id },
    data: { status: newStatus, updatedBy: req.user!.id },
  });

  await logAudit(req, "article:submit", "article", updated.id, { status: article.status }, { status: newStatus });
  res.json({ message: "Review के लिए submit किया गया", status: newStatus, article: updated });
});

// ── Approve Article ───────────────────────────────────────
router.post("/:id/approve", requirePermission("article:approve"),
  async (req: AuthRequest, res: Response) => {
    const article = await prisma.article.findUnique({ where: { id: req.params.id } });
    if (!article) return res.status(404).json({ error: "Article not found" });

    // Sensitive content requires chief_editor or super_admin
    if (article.isSensitive) {
      const sensitiveRoles = ["chief_editor", "super_admin"];
      if (!sensitiveRoles.includes(req.user!.role)) {
        return res.status(403).json({ error: "संवेदनशील सामग्री Chief Editor ही approve कर सकते हैं" });
      }
    }

    const updated = await prisma.article.update({
      where: { id: req.params.id },
      data: {
        status: "approved",
        approvedBy: req.user!.id,
        approvedAt: new Date(),
        updatedBy: req.user!.id,
      },
    });

    await logAudit(req, "article:approve", "article", updated.id, null, { approvedBy: req.user!.id });
    res.json({ message: "Article approved", article: updated });
  }
);

// ── Publish Article ───────────────────────────────────────
router.post("/:id/publish", requirePermission("article:publish"),
  async (req: AuthRequest, res: Response) => {
    const article = await prisma.article.findUnique({ where: { id: req.params.id } });
    if (!article) return res.status(404).json({ error: "Article not found" });

    if (!["approved", "scheduled"].includes(article.status)) {
      return res.status(400).json({ error: "Only approved articles can be published" });
    }

    const updated = await prisma.article.update({
      where: { id: req.params.id },
      data: {
        status: "published",
        publishedAt: new Date(),
        updatedBy: req.user!.id,
      },
    });

    await logAudit(req, "article:publish", "article", updated.id, null, { publishedAt: updated.publishedAt });
    res.json({ message: "Article published!", article: updated });
  }
);

// ── Schedule Article ──────────────────────────────────────
router.post("/:id/schedule", requirePermission("article:approve"),
  async (req: AuthRequest, res: Response) => {
    const { scheduledAt } = req.body;
    if (!scheduledAt) return res.status(400).json({ error: "scheduledAt required" });

    const schedDate = new Date(scheduledAt);
    if (schedDate <= new Date()) {
      return res.status(400).json({ error: "Scheduled time must be in the future" });
    }

    const updated = await prisma.article.update({
      where: { id: req.params.id },
      data: { status: "scheduled", scheduledAt: schedDate, updatedBy: req.user!.id },
    });

    res.json({ message: `${schedDate.toLocaleString("hi-IN")} को publish होगा`, article: updated });
  }
);

// ── Add Correction ────────────────────────────────────────
router.post("/:id/correction", requirePermission("article:approve"),
  async (req: AuthRequest, res: Response) => {
    const { correction, original } = req.body;
    if (!correction) return res.status(400).json({ error: "Correction text required" });

    const result = await prisma.correction.create({
      data: {
        articleId: req.params.id,
        correction,
        original,
        correctedBy: req.user!.id,
        isPublished: true,
        publishedAt: new Date(),
      },
    });

    await logAudit(req, "article:correction", "correction", result.id, null, result);
    res.json({ message: "Correction added", correction: result });
  }
);

// ── Dashboard Stats ───────────────────────────────────────
router.get("/stats/dashboard", async (req: AuthRequest, res: Response) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    pendingReview,
    sensitiveReview,
    publishedToday,
    totalPublished,
    pageViewsToday,
  ] = await Promise.all([
    prisma.article.count({ where: { status: "editor_review" } }),
    prisma.article.count({ where: { status: "sensitive_review" } }),
    prisma.article.count({ where: { status: "published", publishedAt: { gte: today } } }),
    prisma.article.count({ where: { status: "published" } }),
    prisma.pageView.count({ where: { createdAt: { gte: today } } }),
  ]);

  const topArticles = await prisma.article.findMany({
    where: { status: "published", publishedAt: { gte: today } },
    select: { id: true, titleHi: true, slug: true, viewCount: true },
    orderBy: { viewCount: "desc" },
    take: 5,
  });

  res.json({
    pendingReview,
    sensitiveReview,
    publishedToday,
    totalPublished,
    pageViewsToday,
    topArticles,
  });
});

export { router as cmsRouter };
