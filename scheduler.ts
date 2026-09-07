// jobs/scheduler.ts — Cron jobs for ज्ञानवार्ता
// npm install node-cron @prisma/client

import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import { indexArticle, removeArticleFromIndex } from "../services/search";
import { weeklyAnalyticsAgent } from "../agents/weekly";
import { socialPublisher } from "../services/socialPublisher";

const prisma = new PrismaClient();

// ── Job registry ──────────────────────────────────────────
export function startAllJobs() {
  console.log("⏰ Scheduled jobs starting...");

  autoPublishJob();
  socialQueueJob();
  weeklyReportJob();
  searchIndexSyncJob();
  tokenExpiryAlertJob();
  analyticsRollupJob();
  newsletterJob();

  console.log("✅ All cron jobs registered");
}

// ─────────────────────────────────────────────────────────
// JOB 1: Auto-publish scheduled articles
// Runs: every minute
// ─────────────────────────────────────────────────────────
function autoPublishJob() {
  cron.schedule("* * * * *", async () => {
    const now = new Date();

    const due = await prisma.article.findMany({
      where: {
        status: "scheduled",
        scheduledAt: { lte: now },
      },
      select: {
        id: true, titleHi: true, slug: true,
        categoryId: true, heroImageUrl: true,
        summary: true, body: true, readingTimeMins: true,
        isSensitive: true, isAiAssisted: true,
        authors: { include: { user: { select: { name: true } } } },
        tags: { include: { tag: { select: { nameHi: true } } } },
        category: { select: { nameHi: true, slug: true } },
      },
    });

    for (const article of due) {
      await prisma.article.update({
        where: { id: article.id },
        data: { status: "published", publishedAt: now },
      });

      // Index in Meilisearch
      await indexArticle({
        ...article,
        status: "published",
        viewCount: 0,
        publishedAt: now.toISOString(),
        categorySlug: article.category?.slug,
        categoryNameHi: article.category?.nameHi,
        authors: article.authors.map((a) => ({ name: a.user.name })),
        tags: article.tags.map((t) => ({ nameHi: t.tag.nameHi })),
      });

      await prisma.auditLog.create({
        data: {
          action: "article:auto_published",
          entityType: "article",
          entityId: article.id,
          newData: { publishedAt: now.toISOString(), triggeredBy: "cron" },
        },
      });

      console.log(`✅ Auto-published: ${article.titleHi}`);
    }
  });

  console.log("  [JOB] Auto-publish: every minute");
}

// ─────────────────────────────────────────────────────────
// JOB 2: Social queue processor
// Runs: every 5 minutes
// ─────────────────────────────────────────────────────────
function socialQueueJob() {
  cron.schedule("*/5 * * * *", async () => {
    const now = new Date();
    const window = new Date(now.getTime() + 5 * 60 * 1000); // next 5 min

    const duePosts = await prisma.socialPost.findMany({
      where: {
        status: "scheduled",
        scheduledAt: { lte: window },
      },
      include: {
        account: true,
        article: { select: { titleHi: true, slug: true } },
      },
    });

    for (const post of duePosts) {
      try {
        // Mark as "in progress"
        await prisma.socialPost.update({
          where: { id: post.id },
          data: { status: "approved" }, // Temp state
        });

        // Platform-specific publish
        const result = await socialPublisher.publish(post);

        await prisma.socialPost.update({
          where: { id: post.id },
          data: {
            status: "published",
            publishedAt: now,
            platformPostId: result.postId,
            platformUrl: result.url,
          },
        });

        console.log(`✅ Social published [${post.platform}]: ${post.article?.titleHi}`);
      } catch (err) {
        await prisma.socialPost.update({
          where: { id: post.id },
          data: {
            status: "failed",
            errorMessage: String(err).slice(0, 500),
          },
        });
        console.error(`❌ Social failed [${post.platform}]:`, err);
      }
    }
  });

  console.log("  [JOB] Social queue: every 5 minutes");
}

// ─────────────────────────────────────────────────────────
// JOB 3: Weekly analytics + AI report
// Runs: every Monday at 7 AM
// ─────────────────────────────────────────────────────────
function weeklyReportJob() {
  cron.schedule("0 7 * * 1", async () => {
    console.log("📊 Weekly AI report generating...");

    const last7 = new Date(); last7.setDate(last7.getDate() - 7);
    const prev7 = new Date(last7); prev7.setDate(prev7.getDate() - 7);

    const [topArticles, socialMetrics, videoMetrics] = await Promise.all([
      prisma.article.findMany({
        where: { status: "published", publishedAt: { gte: last7 } },
        select: { titleHi: true, viewCount: true, readingTimeMins: true, contentType: true },
        orderBy: { viewCount: "desc" },
        take: 10,
      }),
      prisma.socialPost.aggregate({
        where: { status: "published", publishedAt: { gte: last7 } },
        _sum: { reach: true, impressions: true, engagements: true, clicks: true },
        _count: { id: true },
      }),
      // Video stats placeholder
      { totalViews: 0, watchTimeHours: 0 },
    ]);

    const aiReport = await weeklyAnalyticsAgent({
      topArticles: topArticles.map((a) => ({
        title: a.titleHi,
        views: Number(a.viewCount),
        type: a.contentType,
      })),
      socialMetrics: {
        posts: socialMetrics._count.id,
        totalReach: socialMetrics._sum.reach || 0,
        totalEngagements: socialMetrics._sum.engagements || 0,
        totalClicks: socialMetrics._sum.clicks || 0,
      },
      videoMetrics,
    });

    // Save report
    const weekStart = last7.toISOString().split("T")[0];
    const weekEnd = new Date().toISOString().split("T")[0];

    await prisma.$executeRaw`
      INSERT INTO weekly_analytics_reports
        (week_start, week_end, total_pageviews, top_articles, social_summary, ai_insights, editorial_recs, social_recs, video_recs)
      VALUES (
        ${weekStart}::date,
        ${weekEnd}::date,
        ${0}::bigint,
        ${JSON.stringify(topArticles)}::jsonb,
        ${JSON.stringify(socialMetrics)}::jsonb,
        ${(aiReport as { insights: string }).insights},
        ${JSON.stringify((aiReport as { editorialRecommendations: string[] }).editorialRecommendations)},
        ${JSON.stringify((aiReport as { socialRecommendations: string[] }).socialRecommendations)},
        ${JSON.stringify((aiReport as { videoRecommendations: string[] }).videoRecommendations)}
      )
    `;

    console.log("✅ Weekly AI report saved");
  });

  console.log("  [JOB] Weekly AI report: Monday 7 AM");
}

// ─────────────────────────────────────────────────────────
// JOB 4: Search index sync
// Runs: every hour — re-indexes recently updated articles
// ─────────────────────────────────────────────────────────
function searchIndexSyncJob() {
  cron.schedule("0 * * * *", async () => {
    const since = new Date(); since.setHours(since.getHours() - 1);

    const updated = await prisma.article.findMany({
      where: { updatedAt: { gte: since } },
      include: {
        category: { select: { nameHi: true, slug: true } },
        authors: { include: { user: { select: { name: true } } } },
        tags: { include: { tag: { select: { nameHi: true } } } },
      },
    });

    for (const article of updated) {
      if (article.status === "published") {
        await indexArticle({
          ...article,
          viewCount: Number(article.viewCount),
          categorySlug: article.category?.slug,
          categoryNameHi: article.category?.nameHi,
          authors: article.authors.map((a) => ({ name: a.user.name })),
          tags: article.tags.map((t) => ({ nameHi: t.tag.nameHi })),
        });
      } else {
        await removeArticleFromIndex(article.id).catch(() => {});
      }
    }

    if (updated.length > 0)
      console.log(`🔍 Search synced: ${updated.length} articles`);
  });

  console.log("  [JOB] Search index sync: every hour");
}

// ─────────────────────────────────────────────────────────
// JOB 5: Social token expiry alert
// Runs: every day at 9 AM
// ─────────────────────────────────────────────────────────
function tokenExpiryAlertJob() {
  cron.schedule("0 9 * * *", async () => {
    const in3days = new Date();
    in3days.setDate(in3days.getDate() + 3);

    const expiring = await prisma.socialAccount.findMany({
      where: {
        isActive: true,
        tokenExpires: { lte: in3days, gte: new Date() },
      },
    });

    for (const account of expiring) {
      const daysLeft = Math.ceil(
        ((account.tokenExpires?.getTime() || 0) - Date.now()) / 86400000
      );

      // Log alert (in production: send email/Slack notification)
      await prisma.auditLog.create({
        data: {
          action: "social:token_expiry_alert",
          entityType: "social_account",
          entityId: account.id,
          newData: {
            platform: account.platform,
            accountName: account.accountName,
            daysLeft,
            tokenExpires: account.tokenExpires,
          },
        },
      });

      console.warn(
        `⚠️ Token expiring in ${daysLeft} days: [${account.platform}] ${account.accountName}`
      );
    }
  });

  console.log("  [JOB] Token expiry alert: daily 9 AM");
}

// ─────────────────────────────────────────────────────────
// JOB 6: Analytics rollup (daily)
// Runs: every day at 2 AM
// ─────────────────────────────────────────────────────────
function analyticsRollupJob() {
  cron.schedule("0 2 * * *", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const today = new Date(yesterday);
    today.setDate(today.getDate() + 1);

    // Aggregate view counts per article for yesterday
    const articleViews = await prisma.pageView.groupBy({
      by: ["articleId"],
      where: {
        articleId: { not: null },
        createdAt: { gte: yesterday, lt: today },
      },
      _count: { id: true },
    });

    // Bulk update article view counts
    for (const row of articleViews) {
      if (!row.articleId) continue;
      await prisma.article.update({
        where: { id: row.articleId },
        data: { viewCount: { increment: row._count.id } },
      });
    }

    // Purge page_views older than 90 days (keep aggregated count)
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const deleted = await prisma.pageView.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    console.log(
      `📈 Analytics rollup: ${articleViews.length} articles updated, ${deleted.count} old views purged`
    );
  });

  console.log("  [JOB] Analytics rollup: daily 2 AM");
}

// ─────────────────────────────────────────────────────────
// JOB 7: Newsletter dispatcher
// Runs: every day at 6 AM
// ─────────────────────────────────────────────────────────
function newsletterJob() {
  cron.schedule("0 6 * * *", async () => {
    const today = new Date(); today.setHours(0, 0, 0, 0);

    // Find newsletters scheduled for today
    const newsletters = await prisma.$queryRaw<Array<{ id: string; subject: string }>>`
      SELECT id, subject FROM newsletters
      WHERE scheduled_at >= ${today}
      AND scheduled_at < ${new Date(today.getTime() + 86400000)}
      AND sent_at IS NULL
    `;

    for (const nl of newsletters) {
      const subscribers = await prisma.newsletterSubscriber.findMany({
        where: { isActive: true, confirmed: true },
        select: { email: true, name: true },
      });

      // In production: send via Resend API
      // await resend.emails.send({...})
      console.log(
        `📧 Newsletter "${nl.subject}" → ${subscribers.length} subscribers`
      );

      await prisma.$executeRaw`
        UPDATE newsletters SET sent_at = NOW(), send_count = ${subscribers.length}
        WHERE id = ${nl.id}::uuid
      `;
    }
  });

  console.log("  [JOB] Newsletter: daily 6 AM");
}
