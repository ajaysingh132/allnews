import { Request, Response, NextFunction } from "express";

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);

  // Prisma errors
  if (err.constructor.name === "PrismaClientKnownRequestError") {
    const prismaErr = err as unknown as { code: string; meta?: { target?: string[] } };
    if (prismaErr.code === "P2002") {
      return res.status(409).json({
        error: "यह रिकॉर्ड पहले से मौजूद है",
        field: prismaErr.meta?.target,
      });
    }
    if (prismaErr.code === "P2025") {
      return res.status(404).json({ error: "रिकॉर्ड नहीं मिला" });
    }
  }

  // Validation errors
  if (err.name === "ZodError") {
    return res.status(400).json({ error: "Validation failed", details: err.message });
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({ error: "Invalid token" });
  }
  if (err.name === "TokenExpiredError") {
    return res.status(401).json({ error: "Token expired" });
  }

  res.status(500).json({ error: "Internal server error" });
}

export function auditMiddleware(req: Request, _res: Response, next: NextFunction) {
  // Log all non-GET requests
  if (req.method !== "GET") {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${req.ip}`);
  }
  next();
}
