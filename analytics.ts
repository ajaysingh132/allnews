import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate, requirePermission, AuthRequest } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// ── Main Dashboard ────────────────────────────────────────
router.get("/dashboard", requirePermission("analytics:read"),
  async (_req: AuthRequest, res: Response) => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const last7 = new Date(today); last7.setDate(last7.getDate() - 7);
    const last30 = new Date(today); last30.setDate(last30.getDate() - 30);

    const [
      todayViews, yesterdayViews, last7Views,
      pendingReview, sensitiveReview, publishedToday,
      totalPublished, scheduledSocialPosts,
      socialPublishedToday, newsletterCount,
    ] = await Promise.all([
      prisma.pageView.count({ where: { createdAt: { gte: today } } }),
      prisma.pageView.count({ where: { createdAt: { gte: yesterday, lt: today } } }),
      prisma.pageView.count({ where: { createdAt: { gte: last7 } } }),
      prisma.article.count({ where: { status: "editor_review" } }),
      prisma.article.count({ where: { status: "sensitive_review" } }),
      prisma.article.count({ where: { status: "published", publishedAt: { gte: today } } }),
      prisma.article.count({ where: { status: "published" } }),
      prisma.socialPost.count({ where: { status: "scheduled" } }),
      prisma.socialPost.count({ where: { status: "published", publishedAt: { gte: today } } }),
      prisma.newsletterSubscriber.count({ where: { isActive: true, confirmed: true } }),
    ]);

    // Top articles today
    const topArticles = await prisma.article.findMany({
      where: { status: "published" },
      select: {
        id: true, titleHi: true, slug: true, viewCount: true,
        publishedAt: true, readingTimeMins: true,
        category: { select: { nameHi: true } },
        _count: { select: { pageViews: true } },
      },
      orderBy: { viewCount: "desc" },
      take: 10,
    });

    // Views by hour (today)
    const hourlyViews = await prisma.$queryRaw<Array<{ hour: number; count: bigint }>>`
      SELECT EXTRACT(HOUR FROM created_at)::int AS hour, COUNT(*)::bigint AS count
      FROM page_views
      WHERE created_at >= ${today}
      GROUP BY hour
      ORDER BY hour
    `;

    // Recent audit trail
    const recentActivity = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { user: { select: { name: true, role: true } } },
    });

    // Social queue — next 24h
    const upcomingPosts = await prisma.socialPost.findMany({
      where: {
        status: "scheduled",
        scheduledAt: { gte: new Date(), lte: new Date(Date.now() + 24 * 60 * 60 * 1000) },
      },
      include: { account: { select: { platform: true, accountName: true } } },
      orderBy: { scheduledAt: "asc" },
      take: 10,
    });

    res.json({
      metrics: {
        todayViews,
        yesterdayViews,
        viewsGrowth: yesterdayViews > 0
          ? (((todayViews - yesterdayViews) / yesterdayViews) * 100).toFixed(1)
          : "0",
        last7Views,
        pendingReview,
        sensitiveReview,
        publishedToday,
        totalPublished,
        scheduledSocialPosts,
        socialPublishedToday,
        newsletterCount,
      },
      topArticles,
      hourlyViews: hourlyViews.map((h) => ({ hour: h.hour, count: Number(h.count) })),
      recentActivity,
      upcomingPosts,
    });
  }
);

// ── Article Analytics ─────────────────────────────────────
router.get("/articles", requirePermission("analytics:read"),
  async (req: AuthRequest, res: Response) => {
    const { days = "30", limit = "20" } = req.query;
    const since = new Date();
    since.setDate(since.getDate() - parseInt(days as string));

    const articles = await prisma.article.findMany({
      where: { status: "published", publishedAt: { gte: since } },
      select: {
        id: true, titleHi: true, slug: true, viewCount: true,
        shareCount: true, readingTimeMins: true, publishedAt: true,
        category: { select: { nameHi: true } },
        _count: { select: { pageViews: true } },
      },
      orderBy: { viewCount: "desc" },
      take: parseInt(limit as string),
    });

    // Avg read time per article
    const avgReadTimes = await prisma.$queryRaw<Array<{ article_id: string; avg_secs: number }>>`
      SELECT article_id, AVG(read_secs)::int AS avg_secs
      FROM page_views
      WHERE created_at >= ${since} AND article_id IS NOT NULL
      GROUP BY article_id
    `;
    const readTimeMap = Object.fromEntries(
      avgReadTimes.map((r) => [r.article_id, r.avg_secs])
    );

    // Traffic source breakdown
    const trafficSources = await prisma.$queryRaw<Array<{ utm_source: string; count: bigint }>>`
      SELECT COALESCE(utm_source, 'direct') as utm_source, COUNT(*)::bigint as count
      FROM page_views
      WHERE created_at >= ${since}
      GROUP BY utm_source
      ORDER BY count DESC
      LIMIT 10
    `;

    res.json({
      articles: articles.map((a) => ({
        ...a,
        avgReadSecs: readTimeMap[a.id] || 0,
        viewCount: Number(a.viewCount),
      })),
      trafficSources: trafficSources.map((s) => ({
        source: s.utm_source,
        count: Number(s.count),
      })),
      period: `${days} days`,
    });
  }
);

// ── Track Pageview (public endpoint) ─────────────────────
router.post("/track", async (req: AuthRequest, res: Response) => {
  const { articleId, sessionId, referrer, utmSource, utmMedium, utmCampaign, deviceType } = req.body;

  try {
    await prisma.pageView.create({
      data: {
        articleId: articleId || undefined,
        sessionId,
        referrer,
        utmSource,
        utmMedium,
        utmCampaign,
        deviceType,
        country: req.headers["cf-ipcountry"] as string || undefined,
      },
    });

    // Increment view count
    if (articleId) {
      await prisma.article.update({
        where: { id: articleId },
        data: { viewCount: { increment: 1 } },
      });
    }

    res.json({ tracked: true });
  } catch {
    res.json({ tracked: false }); // Silent fail — tracking should not break UX
  }
});

// ── Update Read Time ──────────────────────────────────────
router.post("/read-time", async (req: AuthRequest, res: Response) => {
  const { articleId, sessionId, readSecs } = req.body;
  if (!articleId || !sessionId || !readSecs) return res.json({ ok: false });

  await prisma.pageView.updateMany({
    where: { articleId, sessionId },
    data: { readSecs: Math.min(readSecs, 3600) }, // Max 1 hour
  });

  res.json({ ok: true });
});

// ── Weekly Summary ────────────────────────────────────────
router.get("/weekly-summary", requirePermission("analytics:read"),
  async (_req: AuthRequest, res: Response) => {
    const last7 = new Date(); last7.setDate(last7.getDate() - 7);
    const prev7 = new Date(last7); prev7.setDate(prev7.getDate() - 7);

    const [thisWeekViews, lastWeekViews, thisWeekPublished, socialThisWeek] = await Promise.all([
      prisma.pageView.count({ where: { createdAt: { gte: last7 } } }),
      prisma.pageView.count({ where: { createdAt: { gte: prev7, lt: last7 } } }),
      prisma.article.count({ where: { status: "published", publishedAt: { gte: last7 } } }),
      prisma.socialPost.count({ where: { status: "published", publishedAt: { gte: last7 } } }),
    ]);

    // Category performance
    const categoryPerf = await prisma.$queryRaw<Array<{ name_hi: string; count: bigint }>>`
      SELECT c.name_hi, COUNT(pv.id)::bigint as count
      FROM page_views pv
      JOIN articles a ON pv.article_id = a.id
      JOIN categories c ON a.category_id = c.id
      WHERE pv.created_at >= ${last7}
      GROUP BY c.name_hi
      ORDER BY count DESC
      LIMIT 8
    `;

    res.json({
      thisWeek: { views: thisWeekViews, published: thisWeekPublished, social: socialThisWeek },
      lastWeek: { views: lastWeekViews },
      viewsGrowth: lastWeekViews > 0
        ? (((thisWeekViews - lastWeekViews) / lastWeekViews) * 100).toFixed(1)
        : "0",
      categoryPerformance: categoryPerf.map((c) => ({
        category: c.name_hi,
        views: Number(c.count),
      })),
    });
  }
);

export { router as analyticsRouter };
