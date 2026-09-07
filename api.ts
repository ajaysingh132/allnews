// lib/api.ts — Typed API client for ज्ञानवार्ता

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export type Article = {
  id: string;
  titleHi: string;
  slug: string;
  subtitle?: string;
  summary?: string;
  heroImageUrl?: string;
  readingTimeMins?: number;
  publishedAt: string;
  viewCount: number;
  contentType: string;
  isAiAssisted: boolean;
  category?: { nameHi: string; slug: string };
  authors?: { user: { name: string; avatarUrl?: string } }[];
  tags?: { tag: { nameHi: string; slug: string } }[];
};

export type Category = {
  id: string;
  nameHi: string;
  slug: string;
  description?: string;
};

// ── Fetch helpers ─────────────────────────────────────────

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts?.headers },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

// ── Public endpoints ──────────────────────────────────────

export const api = {
  articles: {
    latest: (n = 20) =>
      apiFetch<Article[]>(`/v1/articles/latest?limit=${n}`, {
        next: { revalidate: 120 },
      }),

    trending: () =>
      apiFetch<Article[]>("/v1/articles/trending", {
        next: { revalidate: 300 },
      }),

    byCategory: (slug: string, page = 1) =>
      apiFetch<{ articles: Article[]; pagination: { total: number } }>(
        `/v1/articles?category=${slug}&page=${page}`,
        { next: { revalidate: 180 } }
      ),

    single: (slug: string) =>
      apiFetch<Article & { claims: unknown[]; corrections: unknown[] }>(
        `/v1/articles/${slug}`,
        { next: { revalidate: 300 } }
      ),

    search: (q: string) =>
      apiFetch<{ hits: Article[]; total: number }>(
        `/v1/articles/search?q=${encodeURIComponent(q)}`
      ),
  },

  categories: {
    all: () =>
      apiFetch<Category[]>("/v1/categories", { next: { revalidate: 3600 } }),
  },
};
