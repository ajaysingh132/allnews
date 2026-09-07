import { EvidenceItem } from "./all-news-editorial-core";

export interface RawDiscoveredSource {
  id?: string;
  title?: string;
  url?: string;
  publisher?: string;
  sourceType?: EvidenceItem["sourceType"];
  reliability?: EvidenceItem["reliability"];
  publishedAt?: string;
  retrievedAt?: string;
  excerpt?: string;
  content?: string;
  metadata?: Record<string, unknown>;
}

export function normalizeDiscoveredSource(
  raw: RawDiscoveredSource,
  fallback: Partial<EvidenceItem> = {},
): EvidenceItem {
  const now = new Date().toISOString();

  return {
    id: raw.id || fallback.id || cryptoRandomId(),
    title: (raw.title || fallback.title || "Untitled source").trim(),
    url: (raw.url || fallback.url || "").trim(),
    publisher: raw.publisher || fallback.publisher || "",
    sourceType: raw.sourceType || fallback.sourceType || "other",
    reliability: raw.reliability || fallback.reliability || "unverified",
    publishedAt: raw.publishedAt || fallback.publishedAt,
    retrievedAt: raw.retrievedAt || fallback.retrievedAt || now,
    excerpt: raw.excerpt || fallback.excerpt || "",
    content: raw.content || fallback.content || "",
    metadata: { ...(fallback.metadata || {}), ...(raw.metadata || {}) },
  };
}

function cryptoRandomId(): string {
  return `evidence_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
