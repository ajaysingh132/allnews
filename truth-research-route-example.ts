import { Router } from "express";
import { z } from "zod";
import { runAllNewsResearch } from "./research-engine-wiring";
import { SourceDiscoveryProvider } from "./source-discovery-provider";

const requestSchema = z.object({
  topic: z.string().min(3).max(500),
  language: z.string().default("hi"),
  limit: z.number().int().min(1).max(50).default(10),
});

export function createTruthResearchRouter(
  providers: SourceDiscoveryProvider[],
): Router {
  const router = Router();

  router.post("/research", async (req, res) => {
    const parsed = requestSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "invalid_research_request",
        details: parsed.error.flatten(),
      });
    }

    try {
      const result = await runAllNewsResearch(providers, parsed.data);

      return res.json({
        ...result,
        humanReviewRequired: true,
        autoPublish: false,
      });
    } catch (error) {
      return res.status(503).json({
        error: "research_unavailable",
        message: error instanceof Error ? error.message : "Unknown error",
        humanReviewRequired: true,
        autoPublish: false,
      });
    }
  });

  return router;
}
