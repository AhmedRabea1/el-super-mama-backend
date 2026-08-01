import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../db";
import { appUsersTable } from "../db";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET ?? "el-super-mama-secret-change-in-production";
const router = Router();

function signUserToken(payload: { userId: number; email: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

export function formatUser(u: typeof appUsersTable.$inferSelect) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    phone: u.phone,
    stage: u.stage,
    programId: u.programId,
    phaseId: u.phaseId,
    currentDay: u.currentDay,
    isActive: u.isActive,
    subscriptionStatus: u.subscriptionStatus,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
    notes: u.notes,
  };
}

// POST /api/auth/register
router.post("/auth/register", async (req, res) => {
  try {
    const { email, password, name } = req.body as { email: string; password: string; name: string };
    if (!email || !password || !name) {
      res.status(400).json({ error: "email, password, and name are required" });
      return;
    }
    const existing = await db.select().from(appUsersTable).where(eq(appUsersTable.email, email.toLowerCase())).limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const [user] = await db.insert(appUsersTable).values({ email: email.toLowerCase(), passwordHash, name }).returning();
    const token = signUserToken({ userId: user.id, email: user.email });
    res.status(201).json({ token, user: formatUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/login
router.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    const [user] = await db.select().from(appUsersTable).where(eq(appUsersTable.email, email.toLowerCase())).limit(1);
    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    await db.update(appUsersTable).set({ lastLoginAt: new Date() }).where(eq(appUsersTable.id, user.id));
    const token = signUserToken({ userId: user.id, email: user.email });
    res.json({ token, user: formatUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
