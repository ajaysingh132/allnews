import { ALL_NEWS_EDITORIAL_CORE, EvidenceItem, ClaimRecord } from "./all-news-editorial-core";

export interface SourceDiscoveryProvider {
  search(query: string, options?: { limit?: number; language?: string }): Promise<EvidenceItem[]>;
}

export interface ResearchRequest {
  topic: string;
  language?: string;
  limit?: number;
}

export interface ResearchResult {
  topic: string;
  researchProtocolVersion: string;
  sources: EvidenceItem[];
  claims: ClaimRecord[];
  perspectives: Array<{ perspective: string; claims: string[]; evidenceIds: string[] }>;
  timeline: Array<{ date: string; event: string; evidenceIds: string[] }>;
  contradictions: Array<{ issue: string; sideA: string; sideB: string; evidenceIds: string[] }>;
  gaps: string[];
  status: "evidence_ready" | "insufficient_evidence";
}

export class ResearchEngine {
  constructor(private readonly provider: SourceDiscoveryProvider) {}

  async run(request: ResearchRequest): Promise<ResearchResult> {
    const topic = request.topic.trim();
    if (!topic) throw new Error("topic is required");

    const queries = this.buildQueries(topic);
    const batches = await Promise.all(
      queries.map((query) => this.provider.search(query, {
        limit: request.limit ?? 10,
        language: request.language ?? "hi",
      }))
    );

    const sources = this.dedupeSources(batches.flat());
    const primary = sources.filter((s) =>
      ["government", "court", "parliament", "official_document", "press_release", "research_paper", "academic"].includes(s.sourceType)
    );

    const gaps: string[] = [];
    if (sources.length === 0) gaps.push("कोई स्रोत प्राप्त नहीं हुआ।");
    if (primary.length === 0) gaps.push("प्राथमिक/आधिकारिक स्रोत अभी उपलब्ध नहीं है।");
    if (sources.length < 3) gaps.push("स्वतंत्र स्रोतों की पर्याप्त विविधता नहीं है।");

    return {
      topic,
      researchProtocolVersion: "1.0.0",
      sources,
      claims: [],
      perspectives: [],
      timeline: [],
      contradictions: [],
      gaps,
      status: sources.length >= 3 && primary.length >= 1 ? "evidence_ready" : "insufficient_evidence",
    };
  }

  private buildQueries(topic: string): string[] {
    return [
      topic,
      `${topic} official document government court parliament`,
      `${topic} primary source report data`,
      `${topic} criticism opposition response counter evidence`,
    ];
  }

  private dedupeSources(sources: EvidenceItem[]): EvidenceItem[] {
    const map = new Map<string, EvidenceItem>();
    for (const source of sources) {
      const key = source.url || `${source.title}|${source.publisher || ""}`;
      if (!map.has(key)) map.set(key, source);
    }
    return [...map.values()];
  }
}

export function researchPrompt(topic: string): string {
  return `${ALL_NEWS_EDITORIAL_CORE}\n\nविषय: ${topic}\n\nस्रोत के बिना कोई तथ्य न बनाएं। पहले primary evidence खोजें, फिर counter-evidence और independent perspectives खोजें।`;
}
