import { ResearchEngine, ResearchRequest, ResearchResult } from "./research-engine";
import { SourceDiscoveryProvider } from "./source-discovery-provider";
import { CompositeSourceDiscoveryProvider } from "./source-discovery-provider";

/**
 * Factory for production research.
 * Keep provider construction here so the newsroom has one central discovery path.
 */
export function createResearchEngine(
  providers: SourceDiscoveryProvider[],
): ResearchEngine {
  if (providers.length === 0) {
    throw new Error("At least one source discovery provider is required");
  }

  return new ResearchEngine(
    new CompositeSourceDiscoveryProvider(providers),
  );
}

export async function runAllNewsResearch(
  providers: SourceDiscoveryProvider[],
  request: ResearchRequest,
): Promise<ResearchResult> {
  const engine = createResearchEngine(providers);
  return engine.run(request);
}
