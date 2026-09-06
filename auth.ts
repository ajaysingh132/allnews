import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

// Permission map — role → allowed actions
const PERMISSIONS: Record<string, UserRole[]> = {
  "article:publish":       ["super_admin", "admin", "chief_editor"],
  "article:approve":       ["super_admin", "admin", "chief_editor", "editor"],
  "article:create":        ["super_admin", "admin", "chief_editor", "editor", "reporter", "author"],
  "article:delete":        ["super_admin", "admin", "chief_editor"],
  "social:publish":        ["super_admin", "admin", "chief_editor", "social_editor"],
  "social:approve":        ["super_admin", "admin", "chief_editor", "social_editor"],
  "source:manage":         ["super_admin", "admin", "chief_editor", "editor", "reporter", "researcher"],
  "analytics:read":        ["super_admin", "admin", "chief_editor", "analytics"],
  "user:manage":           ["super_admin", "admin"],
  "system:settings":       ["super_admin"],
  "sensitive:approve":     ["super_admin", "chief_editor"],
  "ai:use":                ["super_admin", "admin", "chief_editor", "editor", "reporter", "researcher", "social_editor"],
};

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: UserRole;
    name: string;
  };
}

// Verify JWT and attach user
export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      id: string; email: string; role: UserRole; name: string;
    };
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Check specific permission
export function requirePermission(permission: string) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    const allowed = PERMISSIONS[permission] || [];
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({
        error: "अनुमति नहीं है",
        required: permission,
        yourRole: req.user.role,
      });
    }
    next();
  };
}

// Block sensitive content for non-chief editors
export function requireSensitiveApproval(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.body?.isSensitive) {
    const allowed: UserRole[] = ["super_admin", "chief_editor"];
    if (!req.user || !allowed.includes(req.user.role)) {
      return res.status(403).json({
        error: "संवेदनशील सामग्री के लिए Chief Editor की स्वीकृति आवश्यक है",
      });
    }
  }
  next();
}

// AI internal API key check
export function requireAiKey(req: Request, res: Response, next: NextFunction) {
  const key = req.headers["x-ai-key"];
  if (key !== process.env.AI_INTERNAL_KEY) {
    return res.status(403).json({ error: "Invalid AI API key" });
  }
  next();
}
