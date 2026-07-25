import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET ?? "el-super-mama-secret-change-in-production";

export interface AuthPayload {
  adminId: number;
  email: string;
  role: string;
}

export interface AppUserAuthPayload {
  userId: number;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      admin?: AuthPayload;
      appUser?: AppUserAuthPayload;
    }
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    req.admin = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function signAdminToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

// Verifies the app-user JWT issued by /auth/register and /auth/login
// (see routes/appAuth.ts) and attaches the decoded payload to req.appUser.
export function requireUser(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AppUserAuthPayload;
    req.appUser = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
