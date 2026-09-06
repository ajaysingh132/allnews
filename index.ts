import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { authRouter } from "./routes/auth";
import { articlesRouter } from "./routes/articles";
import { cmsRouter } from "./routes/cms";
import { socialRouter } from "./routes/social";
import { analyticsRouter } from "./routes/analytics";
import { aiRouter } from "./routes/ai";
import { sourcesRouter } from "./routes/sources";
import { newsletterRouter } from "./routes/newsletter";
import { errorHandler } from "./middleware/errorHandler";
import { auditMiddleware } from "./middleware/audit";

const app = express();
const PORT = process.env.PORT || 4000;

// ── Security ─────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ── Rate Limiting ─────────────────────────────────────────
const publicLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: "बहुत अधिक requests। कृपया 1 मिनट बाद retry करें।" },
});

const cmsLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 500,
});

// ── Audit Logging ─────────────────────────────────────────
app.use(auditMiddleware);

// ── Public API Routes ────────────────────────────────────
app.use("/v1", publicLimit);
app.use("/v1/articles", articlesRouter);
app.use("/v1/newsletter", newsletterRouter);

// ── CMS Routes (Auth Required) ───────────────────────────
app.use("/cms", cmsLimit);
app.use("/cms/auth", authRouter);
app.use("/cms/articles", cmsRouter);
app.use("/cms/social", socialRouter);
app.use("/cms/analytics", analyticsRouter);
app.use("/cms/sources", sourcesRouter);

// ── AI Routes (Internal) ─────────────────────────────────
app.use("/ai", aiRouter);

// ── Health Check ─────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "ज्ञानवार्ता API",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

// ── Error Handler ─────────────────────────────────────────
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`✅ ज्ञानवार्ता API running on port ${PORT}`);
});

export default app;
