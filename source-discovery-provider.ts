import { EvidenceItem } from "./all-news-editorial-core";

export interface SourceDiscoverySearchOptions {
  limit?: number;
  language?: string;
  timeoutMs?: number;
}

export interface SourceDiscoveryProvider {
  search(
    query: string,
    options?: SourceDiscoverySearchOptions
  ): Promise<EvidenceItem[]>;
}

/**
 * Provider multiplexer.
 * Runs all configured providers and merges results without inventing evidence.
 */
export class CompositeSourceDiscoveryProvider implements SourceDiscoveryProvider {
  constructor(
    private readonly providers: SourceDiscoveryProvider[],
  ) {}

  async search(
    query: string,
    options: SourceDiscoverySearchOptions = {},
  ): Promise<EvidenceItem[]> {
    if (!query.trim()) return [];

    const batches = await Promise.all(
      this.providers.map(async (provider) => {
        try {
          return await provider.search(query, options);
        } catch {
          // One unavailable provider must not erase evidence from others.
          return [];
        }
      }),
    );

    return dedupeEvidence(batches.flat());
  }
}

export function dedupeEvidence(items: EvidenceItem[]): EvidenceItem[] {
  const seen = new Map<string, EvidenceItem>();

  for (const item of items) {
    const key = [
      item.url?.trim().toLowerCase() ?? "",
      item.title?.trim().toLowerCase() ?? "",
      item.publisher?.trim().toLowerCase() ?? "",
    ].join("|");

    if (!seen.has(key)) seen.set(key, item);
  }

  return [...seen.values()];
}
