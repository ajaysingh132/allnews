import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { MeiliSearch } from "meilisearch";

const router = Router();
const prisma = new PrismaClient();

const meili = new MeiliSearch({
  host: process.env.MEILISEARCH_HOST || "http://localhost:7700",
  apiKey: process.env.MEILISEARCH_API_KEY,
});

// ── List Articles (Public) ────────────────────────────────
router.get("/", async (req: Request, res: Response) => {
  const { category, type, page = "1", limit = "20" } = req.query;
  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

  const where: Record<string, unknown> = { status: "published" };
  if (category) where.categoryId = category;
  if (type) where.contentType = type;

  const [articles, total] = await Promise.all([
    prisma.article.findMany({
      where,
      select: {
        id: true, titleHi: true, slug: true, subtitle: true, summary: true,
        heroImageUrl: true, readingTimeMins: true, publishedAt: true,
        viewCount: true, contentType: true, isAiAssisted: true,
        category: { select: { nameHi: true, slug: true } },
        authors: { include: { user: { select: { name: true, avatarUrl: true } } } },
        tags: { include: { tag: { select: { nameHi: true, slug: true } } } },
      },
      orderBy: { publishedAt: "desc" },
      skip,
      take: parseInt(limit as string),
    }),
    prisma.article.count({ where }),
  ]);

  res.json({
    articles: articles.map((a) => ({ ...a, viewCount: Number(a.viewCount) })),
    pagination: {
      total, page: parseInt(page as string),
      limit: parseInt(limit as string),
      totalPages: Math.ceil(total / parseInt(limit as string)),
    },
  });
});

// ── Latest ────────────────────────────────────────────────
router.get("/latest", async (_req: Request, res: Response) => {
  const articles = await prisma.article.findMany({
    where: { status: "published" },
    select: {
      id: true, titleHi: true, slug: true, summary: true,
      heroImageUrl: true, publishedAt: true, readingTimeMins: true,
      contentType: true,
      category: { select: { nameHi: true, slug: true } },
      authors: { include: { user: { select: { name: true } } } },
    },
    orderBy: { publishedAt: "desc" },
    take: 20,
  });
  res.json(articles);
});

// ── Trending (last 24h by views) ──────────────────────────
router.get("/trending", async (_req: Request, res: Response) => {
  const since = new Date(); since.setHours(since.getHours() - 24);
  const articles = await prisma.article.findMany({
    where: { status: "published", publishedAt: { gte: since } },
    select: {
      id: true, titleHi: true, slug: true, viewCount: true,
      heroImageUrl: true, readingTimeMins: true,
      category: { select: { nameHi: true, slug: true } },
    },
    orderBy: { viewCount: "desc" },
    take: 10,
  });
  res.json(articles.map((a) => ({ ...a, viewCount: Number(a.viewCount) })));
});

// ── Single Article ────────────────────────────────────────
router.get("/:slug", async (req: Request, res: Response) => {
  const article = await prisma.article.findUnique({
    where: { slug: req.params.slug },
    include: {
      category: true,
      authors: { include: { user: { select: { id: true, name: true, avatarUrl: true, bio: true } } } },
      tags: { include: { tag: true } },
      corrections: { where: { isPublished: true }, orderBy: { publishedAt: "desc" } },
      claims: { include: { source: { select: { name: true, url: true, sourceType: true, reliabilityStatus: true } } } },
    },
  });

  if (!article || article.status !== "published") {
    return res.status(404).json({ error: "Article not found" });
  }

  res.json({ ...article, viewCount: Number(article.viewCount) });
});

// ── Full-text Search ──────────────────────────────────────
router.get("/search", async (req: Request, res: Response) => {
  const { q, category, type, page = "1" } = req.query;
  if (!q || String(q).length < 2) {
    return res.status(400).json({ error: "Search query too short" });
  }

  try {
    // Try Meilisearch first
    const index = meili.index("articles");
    const filters: string[] = [];
    if (category) filters.push(`categorySlug = "${category}"`);
    if (type) filters.push(`contentType = "${type}"`);

    const result = await index.search(String(q), {
      limit: 20,
      offset: (parseInt(page as string) - 1) * 20,
      filter: filters.length > 0 ? filters.join(" AND ") : undefined,
      attributesToHighlight: ["titleHi", "summary", "body"],
      highlightPreTag: "<mark>",
      highlightPostTag: "</mark>",
    });

    res.json({
      hits: result.hits,
      total: result.estimatedTotalHits,
      query: q,
      processingTimeMs: result.processingTimeMs,
    });
  } catch {
    // Fallback to DB search if Meilisearch unavailable
    const articles = await prisma.article.findMany({
      where: {
        status: "published",
        OR: [
          { titleHi: { contains: String(q), mode: "insensitive" } },
          { summary: { contains: String(q), mode: "insensitive" } },
        ],
      },
      select: {
        id: true, titleHi: true, slug: true, summary: true,
        heroImageUrl: true, publishedAt: true,
        category: { select: { nameHi: true, slug: true } },
      },
      take: 20,
    });
    res.json({ hits: articles, total: articles.length, query: q, fallback: true });
  }
});

// ── Sitemap Data ──────────────────────────────────────────
router.get("/sitemap/urls", async (_req: Request, res: Response) => {
  const articles = await prisma.article.findMany({
    where: { status: "published" },
    select: { slug: true, updatedAt: true, categoryId: true },
    orderBy: { publishedAt: "desc" },
  });
  res.json(articles);
});

// ── RSS Feed ──────────────────────────────────────────────
router.get("/feed/rss", async (_req: Request, res: Response) => {
  const articles = await prisma.article.findMany({
    where: { status: "published" },
    select: {
      titleHi: true, slug: true, summary: true, publishedAt: true,
      heroImageUrl: true,
      category: { select: { nameHi: true, slug: true } },
      authors: { include: { user: { select: { name: true } } } },
    },
    orderBy: { publishedAt: "desc" },
    take: 50,
  });

  const items = articles.map((a) => `
    <item>
      <title><![CDATA[${a.titleHi}]]></title>
      <link>https://gyanvarta.in/${a.category?.slug || "uncategorized"}/${a.slug}</link>
      <description><![CDATA[${a.summary || ""}]]></description>
      <pubDate>${a.publishedAt?.toUTCString()}</pubDate>
      <author>${a.authors[0]?.user.name || "ज्ञानवार्ता"}</author>
      ${a.heroImageUrl ? `<enclosure url="${a.heroImageUrl}" type="image/jpeg"/>` : ""}
    </item>
  `).join("");

  res.set("Content-Type", "application/rss+xml; charset=utf-8");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
      <channel>
        <title>ज्ञानवार्ता</title>
        <link>https://gyanvarta.in</link>
        <description>गहन विश्लेषण, तथ्य-जाँच और शोध</description>
        <language>hi</language>
        <atom:link href="https://gyanvarta.in/feed.xml" rel="self" type="application/rss+xml"/>
        ${items}
      </channel>
    </rss>`
  );
});

export { router as articlesRouter };
