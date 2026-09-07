import {
  SourceDiscoveryProvider,
  SourceDiscoverySearchOptions,
} from "./source-discovery-provider";
import { EvidenceItem } from "./all-news-editorial-core";
import { normalizeDiscoveredSource, RawDiscoveredSource } from "./source-normalizer";

export interface HttpSourceDiscoveryConfig {
  endpoint: string;
  token?: string;
  method?: "GET" | "POST";
  providerName: string;
  timeoutMs?: number;
}

/**
 * Generic provider-neutral HTTP adapter.
 * It accepts only source records returned by the configured provider.
 * It never creates synthetic URLs, quotes, facts, or evidence.
 */
export class HttpSourceDiscoveryProvider implements SourceDiscoveryProvider {
  constructor(private readonly config: HttpSourceDiscoveryConfig) {}

  async search(
    query: string,
    options: SourceDiscoverySearchOptions = {},
  ): Promise<EvidenceItem[]> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? this.config.timeoutMs ?? 12_000,
    );

    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
      };

      if (this.config.token) {
        headers.Authorization = `Bearer ${this.config.token}`;
      }

      const limit = options.limit ?? 10;
      const url = new URL(this.config.endpoint);

      let response: Response;

      if ((this.config.method ?? "GET") === "GET") {
        url.searchParams.set("q", query);
        url.searchParams.set("limit", String(limit));
        if (options.language) url.searchParams.set("language", options.language);

        response = await fetch(url, {
          method: "GET",
          headers,
          signal: controller.signal,
        });
      } else {
        headers["Content-Type"] = "application/json";
        response = await fetch(this.config.endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify({
            query,
            limit,
            language: options.language,
          }),
          signal: controller.signal,
        });
      }

      if (!response.ok) return [];

      const payload = await response.json() as unknown;
      const records = extractRecords(payload);

      return records
        .map((record) =>
          normalizeDiscoveredSource(record, {
            metadata: { provider: this.config.providerName },
          }),
        )
        .filter((item) => Boolean(item.url || item.title));
    } finally {
      clearTimeout(timeout);
    }
  }
}

function extractRecords(payload: unknown): RawDiscoveredSource[] {
  if (Array.isArray(payload)) return payload as RawDiscoveredSource[];

  if (!payload || typeof payload !== "object") return [];

  const obj = payload as Record<string, unknown>;

  for (const key of ["results", "items", "data", "sources", "records"]) {
    if (Array.isArray(obj[key])) return obj[key] as RawDiscoveredSource[];
  }

  return [];
}
