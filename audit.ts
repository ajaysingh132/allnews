import { PrismaClient } from "@prisma/client";
import { AuthRequest } from "../middleware/auth";

const prisma = new PrismaClient();

export async function logAudit(
  req: AuthRequest,
  action: string,
  entityType: string,
  entityId: string,
  oldData: unknown,
  newData: unknown
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: req.user?.id,
        action,
        entityType,
        entityId,
        oldData: oldData ? (oldData as Record<string, unknown>) : undefined,
        newData: newData ? (newData as Record<string, unknown>) : undefined,
        ipAddress: (req.headers["x-forwarded-for"] as string) || req.ip || "",
      },
    });
  } catch {
    // Audit log failure should not break the request
    console.error("Audit log failed:", action, entityId);
  }
}
