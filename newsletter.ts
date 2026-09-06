import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

const router = Router();
const prisma = new PrismaClient();

// ── Subscribe ─────────────────────────────────────────────
router.post("/subscribe", async (req: Request, res: Response) => {
  const schema = z.object({
    email: z.string().email("Valid email required"),
    name: z.string().optional(),
    subscriptionTypes: z.array(z.string()).optional().default(["daily_brief"]),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }

  const { email, name, subscriptionTypes } = parsed.data;
  const confirmToken = uuidv4();

  try {
    const existing = await prisma.newsletterSubscriber.findUnique({ where: { email } });

    if (existing) {
      if (existing.isActive) {
        return res.json({ message: "आप पहले से सदस्य हैं!", alreadySubscribed: true });
      }
      // Reactivate
      await prisma.newsletterSubscriber.update({
        where: { email },
        data: { isActive: true, confirmToken, confirmed: false, unsubscribedAt: null },
      });
    } else {
      await prisma.newsletterSubscriber.create({
        data: { email, name, subscriptionTypes, confirmToken },
      });
    }

    // In production: send confirmation email via Resend API
    // await sendConfirmationEmail(email, confirmToken)

    res.json({
      message: "सदस्यता के लिए धन्यवाद! कृपया अपने email में confirmation link देखें।",
      confirmToken, // Remove in production
    });
  } catch {
    res.status(500).json({ error: "Subscription failed" });
  }
});

// ── Confirm ───────────────────────────────────────────────
router.get("/confirm/:token", async (req: Request, res: Response) => {
  const subscriber = await prisma.newsletterSubscriber.findFirst({
    where: { confirmToken: req.params.token },
  });

  if (!subscriber) {
    return res.status(404).json({ error: "Invalid or expired token" });
  }

  await prisma.newsletterSubscriber.update({
    where: { id: subscriber.id },
    data: { confirmed: true, confirmToken: null },
  });

  res.json({ message: "Email confirm हो गया! आप अब हमारे newsletter के सदस्य हैं।" });
});

// ── Unsubscribe ───────────────────────────────────────────
router.post("/unsubscribe", async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });

  await prisma.newsletterSubscriber.updateMany({
    where: { email },
    data: { isActive: false, unsubscribedAt: new Date() },
  });

  res.json({ message: "Unsubscribed successfully" });
});

export { router as newsletterRouter };
