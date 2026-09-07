// services/search.ts — Meilisearch Hindi Search Setup
// Run: npm install meilisearch

import { MeiliSearch } from "meilisearch";

const client = new MeiliSearch({
  host: process.env.MEILISEARCH_HOST || "http://localhost:7700",
  apiKey: process.env.MEILISEARCH_MASTER_KEY,
});

const INDEX_NAME = "articles";

// ── Index Settings (run once at setup) ───────────────────
export async function setupSearchIndex() {
  console.log("🔍 Meilisearch index setup शुरू...");

  const index = client.index(INDEX_NAME);

  // 1. Searchable attributes — Hindi title first for relevance
  await index.updateSearchableAttributes([
    "titleHi",
    "titleEn",
    "summary",
    "body",
    "authorNames",
    "categoryNameHi",
    "tagNames",
  ]);

  // 2. Filterable attributes — for category/type filtering
  await index.updateFilterableAttributes([
    "status",
    "contentType",
    "categorySlug",
    "categoryNameHi",
    "isSensitive",
    "isAiAssisted",
    "publishedAt",
  ]);

  // 3. Sortable attributes
  await index.updateSortableAttributes([
    "publishedAt",
    "viewCount",
    "readingTimeMins",
  ]);

  // 4. Ranking rules — tuned for Hindi news
  await index.updateRankingRules([
    "words",        // All query words match
    "typo",         // Fewer typos = higher rank
    "proximity",    // Words closer together = higher
    "attribute",    // Earlier in searchableAttributes = higher
    "sort",         // Custom sort
    "exactness",    // Exact matches first
    "publishedAt:desc", // Latest first for equal scores
  ]);

  // 5. Typo tolerance — important for Hindi Devanagari
  await index.updateTypoTolerance({
    enabled: true,
    minWordSizeForTypos: {
      oneTypo: 4,   // Words >= 4 chars allow 1 typo
      twoTypos: 8,  // Words >= 8 chars allow 2 typos
    },
    disableOnWords: [],
    disableOnAttributes: ["categorySlug"], // Exact match for slugs
  });

  // 6. Synonyms — Hindi spelling variants
  await index.updateSynonyms({
    // Common Hindi political terms
    "भाजपा":   ["BJP", "भारतीय जनता पार्टी"],
    "कांग्रेस": ["INC", "Indian National Congress"],
    "सुप्रीम कोर्ट": ["Supreme Court", "सर्वोच्च न्यायालय"],
    "बजट":     ["Budget", "केंद्रीय बजट"],
    "चुनाव":   ["Election", "मतदान", "निर्वाचन"],
    "संसद":    ["Parliament", "लोकसभा", "राज्यसभा"],
    "प्रधानमंत्री": ["PM", "Prime Minister"],
    "राष्ट्रपति": ["President", "Rashtrapati"],
    "न्यायालय": ["Court", "Court", "अदालत"],
    "सरकार":   ["Government", "Govt"],
  });

  // 7. Stop words — common Hindi articles/prepositions to ignore
  await index.updateStopWords([
    "का", "की", "के", "में", "है", "हैं", "था", "थे",
    "और", "या", "से", "पर", "को", "ने", "ही", "भी",
    "तो", "लेकिन", "क्योंकि", "जो", "जब", "वह", "यह",
    "इस", "उस", "एक", "एवं", "द्वारा", "तक",
  ]);

  // 8. Distinct attribute — one result per article
  await index.updateDistinctAttribute("id");

  console.log("✅ Meilisearch index settings saved");
}

// ── Index an article ──────────────────────────────────────
export async function indexArticle(article: {
  id: string;
  titleHi: string;
  titleEn?: string;
  slug: string;
  summary?: string;
  body: string;
  contentType: string;
  status: string;
  categorySlug?: string;
  categoryNameHi?: string;
  publishedAt?: string;
  viewCount: number;
  readingTimeMins?: number;
  isSensitive: boolean;
  isAiAssisted: boolean;
  heroImageUrl?: string;
  authors?: { name: string }[];
  tags?: { nameHi: string }[];
}) {
  const index = client.index(INDEX_NAME);

  // Only index published articles
  if (article.status !== "published") return;

  const doc = {
    id: article.id,
    titleHi: article.titleHi,
    titleEn: article.titleEn || "",
    slug: article.slug,
    summary: article.summary || "",
    // Strip HTML tags from body for search
    body: article.body.replace(/<[^>]*>/g, "").slice(0, 5000),
    contentType: article.contentType,
    status: article.status,
    categorySlug: article.categorySlug || "",
    categoryNameHi: article.categoryNameHi || "",
    publishedAt: article.publishedAt
      ? new Date(article.publishedAt).getTime() / 1000  // Unix timestamp for sorting
      : 0,
    viewCount: Number(article.viewCount) || 0,
    readingTimeMins: article.readingTimeMins || 0,
    isSensitive: article.isSensitive,
    isAiAssisted: article.isAiAssisted,
    heroImageUrl: article.heroImageUrl || "",
    authorNames: (article.authors || []).map((a) => a.name).join(", "),
    tagNames: (article.tags || []).map((t) => t.nameHi).join(", "),
  };

  await index.addDocuments([doc]);
  console.log(`✅ Indexed: ${article.titleHi}`);
}

// ── Remove article from index ─────────────────────────────
export async function removeArticleFromIndex(articleId: string) {
  const index = client.index(INDEX_NAME);
  await index.deleteDocument(articleId);
  console.log(`🗑 Removed from index: ${articleId}`);
}

// ── Search articles ───────────────────────────────────────
export async function searchArticles(query: string, options: {
  category?: string;
  contentType?: string;
  page?: number;
  limit?: number;
  sort?: "publishedAt:desc" | "viewCount:desc" | "publishedAt:asc";
} = {}) {
  const index = client.index(INDEX_NAME);
  const {
    category,
    contentType,
    page = 1,
    limit = 20,
    sort = "publishedAt:desc",
  } = options;

  const filters: string[] = ['status = "published"'];
  if (category) filters.push(`categorySlug = "${category}"`);
  if (contentType) filters.push(`contentType = "${contentType}"`);

  const result = await index.search(query, {
    limit,
    offset: (page - 1) * limit,
    filter: filters.join(" AND "),
    sort: [sort],
    attributesToHighlight: ["titleHi", "summary"],
    highlightPreTag: '<mark class="bg-yellow-100">',
    highlightPostTag: "</mark>",
    attributesToCrop: ["body"],
    cropLength: 200,
    showRankingScore: false,
  });

  return {
    hits: result.hits,
    total: result.estimatedTotalHits || 0,
    query: result.query,
    processingMs: result.processingTimeMs,
    page,
  };
}

// ── Bulk index (run for existing articles) ────────────────
export async function bulkIndexArticles(articles: Parameters<typeof indexArticle>[0][]) {
  console.log(`📦 Bulk indexing ${articles.length} articles...`);
  const index = client.index(INDEX_NAME);

  const docs = articles
    .filter((a) => a.status === "published")
    .map((a) => ({
      id: a.id,
      titleHi: a.titleHi,
      titleEn: a.titleEn || "",
      slug: a.slug,
      summary: a.summary || "",
      body: a.body.replace(/<[^>]*>/g, "").slice(0, 5000),
      contentType: a.contentType,
      status: a.status,
      categorySlug: a.categorySlug || "",
      categoryNameHi: a.categoryNameHi || "",
      publishedAt: a.publishedAt ? new Date(a.publishedAt).getTime() / 1000 : 0,
      viewCount: Number(a.viewCount) || 0,
      readingTimeMins: a.readingTimeMins || 0,
      isSensitive: a.isSensitive,
      isAiAssisted: a.isAiAssisted,
      heroImageUrl: a.heroImageUrl || "",
      authorNames: (a.authors || []).map((au) => au.name).join(", "),
      tagNames: (a.tags || []).map((t) => t.nameHi).join(", "),
    }));

  // Batch in groups of 100
  const BATCH = 100;
  for (let i = 0; i < docs.length; i += BATCH) {
    const batch = docs.slice(i, i + BATCH);
    const task = await index.addDocuments(batch);
    console.log(`  Batch ${Math.ceil(i / BATCH) + 1}: Task ${task.taskUid}`);
  }

  console.log(`✅ Bulk index complete: ${docs.length} articles`);
}

// ── Health check ──────────────────────────────────────────
export async function checkSearchHealth() {
  try {
    const health = await client.health();
    const stats = await client.index(INDEX_NAME).getStats();
    return {
      healthy: health.status === "available",
      totalDocuments: stats.numberOfDocuments,
      isIndexing: stats.isIndexing,
    };
  } catch {
    return { healthy: false, totalDocuments: 0, isIndexing: false };
  }
}

export { client as meiliClient };
