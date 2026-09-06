import { Router, Response } from "express";
import { PrismaClient, PostStatus } from "@prisma/client";
import { z } from "zod";
import { authenticate, requirePermission, AuthRequest } from "../middleware/auth";
import { logAudit } from "../utils/audit";

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// ── Create Social Post ────────────────────────────────────
router.post("/posts", async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    articleId: z.string().uuid().optional(),
    accountId: z.string().uuid(),
    platform: z.enum(["youtube","facebook","instagram","x_twitter","threads","telegram","whatsapp_channel","linkedin"]),
    content: z.string().min(1).max(5000),
    mediaUrls: z.array(z.string().url()).optional().default([]),
    scheduledAt: z.string().datetime().optional(),
    isAiGenerated: z.boolean().optional().default(false),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.errors });

  const post = await prisma.socialPost.create({
    data: {
      ...parsed.data,
      status: parsed.data.scheduledAt ? "scheduled" : "draft",
      createdById: req.user!.id,
    },
    include: { account: { select: { platform: true, accountName: true } } },
  });

  await logAudit(req, "social:create", "social_post", post.id, null, post);
  res.status(201).json(post);
});

// ── List Posts (with calendar view) ──────────────────────
router.get("/queue", async (req: AuthRequest, res: Response) => {
  const { platform, status, date, page = "1" } = req.query;

  const where: Record<string, unknown> = {};
  if (platform) where.platform = platform;
  if (status) where.status = status;

  if (date) {
    const d = new Date(date as string);
    const nextDay = new Date(d);
    nextDay.setDate(d.getDate() + 1);
    where.scheduledAt = { gte: d, lt: nextDay };
  }

  const posts = await prisma.socialPost.findMany({
    where,
    include: {
      account: { select: { platform: true, accountName: true, username: true } },
      article: { select: { titleHi: true, slug: true } },
    },
    orderBy: { scheduledAt: "asc" },
    take: 50,
    skip: (parseInt(page as string) - 1) * 50,
  });

  res.json(posts);
});

// ── Calendar View (7-day) ─────────────────────────────────
router.get("/calendar", async (req: AuthRequest, res: Response) => {
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 7);

  const posts = await prisma.socialPost.findMany({
    where: {
      scheduledAt: { gte: startDate, lte: endDate },
      status: { in: ["scheduled", "approved", "published"] },
    },
    include: {
      account: { select: { platform: true, accountName: true } },
      article: { select: { titleHi: true } },
    },
    orderBy: { scheduledAt: "asc" },
  });

  // Group by date
  const calendar: Record<string, unknown[]> = {};
  posts.forEach((post) => {
    const dateKey = post.scheduledAt?.toISOString().split("T")[0] || "unscheduled";
    if (!calendar[dateKey]) calendar[dateKey] = [];
    calendar[dateKey].push(post);
  });

  res.json({ calendar, dateRange: { start: startDate, end: endDate } });
});

// ── Approve Post ──────────────────────────────────────────
router.post("/posts/:id/approve", requirePermission("social:approve"),
  async (req: AuthRequest, res: Response) => {
    const post = await prisma.socialPost.findUnique({ where: { id: req.params.id } });
    if (!post) return res.status(404).json({ error: "Post not found" });

    const updated = await prisma.socialPost.update({
      where: { id: req.params.id },
      data: {
        status: post.scheduledAt ? "scheduled" : "approved",
        approvedById: req.user!.id,
        approvedAt: new Date(),
      },
    });

    await logAudit(req, "social:approve", "social_post", updated.id, null, { approvedBy: req.user!.id });
    res.json({ message: "Post approved", post: updated });
  }
);

// ── Update Post ───────────────────────────────────────────
router.put("/posts/:id", async (req: AuthRequest, res: Response) => {
  const existing = await prisma.socialPost.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Post not found" });

  if (["published", "archived"].includes(existing.status)) {
    return res.status(400).json({ error: "Published or archived posts cannot be edited" });
  }

  const updated = await prisma.socialPost.update({
    where: { id: req.params.id },
    data: {
      content: req.body.content,
      scheduledAt: req.body.scheduledAt ? new Date(req.body.scheduledAt) : undefined,
      mediaUrls: req.body.mediaUrls,
      status: "editor_review", // Reset to review after edit
    },
  });

  res.json(updated);
});

// ── Publish Post Now ──────────────────────────────────────
router.post("/posts/:id/publish", requirePermission("social:publish"),
  async (req: AuthRequest, res: Response) => {
    const post = await prisma.socialPost.findUnique({
      where: { id: req.params.id },
      include: { account: true },
    });
    if (!post) return res.status(404).json({ error: "Post not found" });

    if (!["approved", "scheduled"].includes(post.status)) {
      return res.status(400).json({ error: "Only approved posts can be published" });
    }

    // In production: call respective platform API here
    // For now: mark as published with mock platform ID
    const mockPlatformId = `${post.platform}_${Date.now()}`;

    const updated = await prisma.socialPost.update({
      where: { id: req.params.id },
      data: {
        status: "published",
        publishedAt: new Date(),
        platformPostId: mockPlatformId,
        platformUrl: `https://${post.platform}.com/post/${mockPlatformId}`,
      },
    });

    await logAudit(req, "social:publish", "social_post", updated.id, null, { publishedAt: updated.publishedAt });
    res.json({ message: "Published!", post: updated });
  }
);

// ── Analytics Summary ─────────────────────────────────────
router.get("/analytics", async (req: AuthRequest, res: Response) => {
  const { platform, days = "7" } = req.query;
  const since = new Date();
  since.setDate(since.getDate() - parseInt(days as string));

  const where: Record<string, unknown> = {
    status: "published",
    publishedAt: { gte: since },
  };
  if (platform) where.platform = platform;

  const posts = await prisma.socialPost.findMany({
    where,
    select: {
      platform: true, reach: true, impressions: true,
      engagements: true, clicks: true, publishedAt: true,
    },
  });

  // Group by platform
  const byPlatform: Record<string, { posts: number; totalReach: number; totalEngagements: number; totalClicks: number }> = {};
  posts.forEach((p) => {
    if (!byPlatform[p.platform]) {
      byPlatform[p.platform] = { posts: 0, totalReach: 0, totalEngagements: 0, totalClicks: 0 };
    }
    byPlatform[p.platform].posts++;
    byPlatform[p.platform].totalReach += p.reach;
    byPlatform[p.platform].totalEngagements += p.engagements;
    byPlatform[p.platform].totalClicks += p.clicks;
  });

  res.json({
    period: `last ${days} days`,
    totalPosts: posts.length,
    byPlatform,
    totalReach: posts.reduce((s, p) => s + p.reach, 0),
    totalEngagements: posts.reduce((s, p) => s + p.engagements, 0),
    totalClicks: posts.reduce((s, p) => s + p.clicks, 0),
  });
});

// ── Social Accounts ───────────────────────────────────────
router.get("/accounts", async (_req: AuthRequest, res: Response) => {
  const accounts = await prisma.socialAccount.findMany({
    where: { isActive: true },
    select: {
      id: true, platform: true, accountName: true, username: true,
      profileUrl: true, followersCount: true, tokenExpires: true,
    },
    orderBy: { platform: "asc" },
  });

  // Flag expiring tokens
  const now = new Date();
  const warningDays = 3;
  const accountsWithWarnings = accounts.map((a) => ({
    ...a,
    tokenWarning: a.tokenExpires
      ? (a.tokenExpires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24) < warningDays
      : false,
  }));

  res.json(accountsWithWarnings);
});

export { router as socialRouter };
