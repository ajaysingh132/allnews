import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { authenticate, requirePermission, AuthRequest } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

const sourceSchema = z.object({
  name: z.string().min(2),
  sourceType: z.enum([
    "government","court","parliament","official_document",
    "press_release","interview","research_paper","academic",
    "news_organisation","field_report","social_media","other",
  ]),
  url: z.string().url().optional().or(z.literal("")),
  documentUrl: z.string().url().optional().or(z.literal("")),
  publicationDate: z.string().optional(),
  authorName: z.string().optional(),
  institution: z.string().optional(),
  reliabilityStatus: z.enum(["high","medium","low","unverified","disputed"]).optional(),
  topic: z.string().optional(),
  evidenceType: z.string().optional(),
  notes: z.string().optional(),
});

// ── List Sources ──────────────────────────────────────────
router.get("/", async (req: AuthRequest, res: Response) => {
  const { type, reliability, search, page = "1" } = req.query;
  const where: Record<string, unknown> = {};
  if (type) where.sourceType = type;
  if (reliability) where.reliabilityStatus = reliability;
  if (search) where.name = { contains: search, mode: "insensitive" };

  const [sources, total] = await Promise.all([
    prisma.source.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (parseInt(page as string) - 1) * 30,
      take: 30,
      include: { _count: { select: { claims: true } } },
    }),
    prisma.source.count({ where }),
  ]);

  res.json({ sources, total, page: parseInt(page as string) });
});

// ── Create Source ─────────────────────────────────────────
router.post("/", requirePermission("source:manage"),
  async (req: AuthRequest, res: Response) => {
    const parsed = sourceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.errors });

    const source = await prisma.source.create({
      data: { ...parsed.data, addedBy: req.user!.id },
    });
    res.status(201).json(source);
  }
);

// ── Update Source ─────────────────────────────────────────
router.put("/:id", requirePermission("source:manage"),
  async (req: AuthRequest, res: Response) => {
    const parsed = sourceSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed" });

    const updated = await prisma.source.update({
      where: { id: req.params.id },
      data: parsed.data,
    });
    res.json(updated);
  }
);

// ── Add Claim to Article ──────────────────────────────────
router.post("/claims", requirePermission("source:manage"),
  async (req: AuthRequest, res: Response) => {
    const schema = z.object({
      articleId: z.string().uuid(),
      claimText: z.string().min(5),
      classification: z.enum([
        "fact","claim","official_statement","documented_evidence",
        "unverified","analysis","opinion",
      ]),
      sourceId: z.string().uuid().optional(),
      madeBy: z.string().optional(),
      context: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed" });

    const claim = await prisma.claim.create({ data: parsed.data });
    res.status(201).json(claim);
  }
);

// ── Verify Claim ──────────────────────────────────────────
router.post("/claims/:id/verify", requirePermission("article:approve"),
  async (req: AuthRequest, res: Response) => {
    const { isVerified, verificationNote } = req.body;

    const updated = await prisma.claim.update({
      where: { id: req.params.id },
      data: {
        isVerified: !!isVerified,
        verificationNote,
        verifiedBy: req.user!.id,
        verifiedAt: new Date(),
      },
    });
    res.json(updated);
  }
);

export { router as sourcesRouter };
