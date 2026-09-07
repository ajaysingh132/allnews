import assert from "node:assert/strict";
import test from "node:test";
import { ResearchEngine } from "./research-engine";
import { EvidenceItem } from "./all-news-editorial-core";
import { SourceDiscoveryProvider } from "./source-discovery-provider";

function evidence(
  id: string,
  sourceType: EvidenceItem["sourceType"],
): EvidenceItem {
  return {
    id,
    title: id,
    url: `https://example.test/${id}`,
    publisher: "Test Publisher",
    sourceType,
    reliability: sourceType === "government" ? "high" : "low",
    retrievedAt: new Date().toISOString(),
  };
}

test("research engine uses discovered evidence and marks insufficient evidence correctly", async () => {
  const provider: SourceDiscoveryProvider = {
    async search() {
      return [
        evidence("gov-1", "government"),
        evidence("news-1", "news_organisation"),
        evidence("social-1", "social_media"),
      ];
    },
  };

  const result = await new ResearchEngine(provider).run({
    topic: "परीक्षण विषय",
    language: "hi",
    limit: 10,
  });

  assert.equal(result.status, "evidence_ready");
  assert.equal(result.sources.length, 3);
  assert.equal(result.claims.length, 0);
  assert.equal(result.perspectives.length, 0);
});

test("empty discovery never becomes fabricated research", async () => {
  const provider: SourceDiscoveryProvider = {
    async search() {
      return [];
    },
  };

  const result = await new ResearchEngine(provider).run({
    topic: "कोई स्रोत नहीं",
  });

  assert.equal(result.status, "insufficient_evidence");
  assert.ok(result.gaps.length >= 2);
});
