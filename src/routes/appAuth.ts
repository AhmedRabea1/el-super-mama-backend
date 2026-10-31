import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { db } from "../db";
import { appUsersTable } from "../db";
import { eq } from "drizzle-orm";
import { sendVerificationEmail } from "../lib/mailer.js";

const JWT_SECRET = process.env.JWT_SECRET ?? "el-super-mama-secret-change-in-production";
const VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;
const VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_VERIFICATION_ATTEMPTS = 5;
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
    emailVerified: u.emailVerified,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
    notes: u.notes,
  };
}

// Generates a 6-digit code and its bcrypt hash — the raw code is only ever
// emailed to the user, never stored; the hash is what's persisted.
async function createVerificationCode(): Promise<{ code: string; hash: string }> {
  const code = crypto.randomInt(100000, 999999).toString();
  const hash = await bcrypt.hash(code, 10);
  return { code, hash };
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
    const { code, hash } = await createVerificationCode();
    const [user] = await db
      .insert(appUsersTable)
      .values({
        email: email.toLowerCase(),
        passwordHash,
        name,
        emailVerified: false,
        emailVerificationCode: hash,
        emailVerificationExpiresAt: new Date(Date.now() + VERIFICATION_CODE_TTL_MS),
        lastVerificationSentAt: new Date(),
      })
      .returning();

    // Best-effort: a mail-send failure shouldn't fail registration itself —
    // the account exists either way, the user can request a resend.
    try {
      await sendVerificationEmail(user.email, code);
    } catch (mailErr) {
      console.error("[auth/register] Failed to send verification email:", mailErr);
    }

    const token = signUserToken({ userId: user.id, email: user.email });
    res.status(201).json({ token, user: formatUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/verify-email
router.post("/auth/verify-email", async (req, res) => {
  try {
    const { email, code } = req.body as { email?: string; code?: string };
    if (!email || !code) {
      res.status(400).json({ error: "email and code are required" });
      return;
    }

    const [user] = await db.select().from(appUsersTable).where(eq(appUsersTable.email, email.toLowerCase())).limit(1);
    if (!user || !user.emailVerificationCode || !user.emailVerificationExpiresAt) {
      res.status(400).json({ error: "No pending verification for this account" });
      return;
    }
    if (user.emailVerificationAttempts >= MAX_VERIFICATION_ATTEMPTS) {
      res.status(429).json({ error: "Too many attempts — request a new code" });
      return;
    }
    if (new Date() > user.emailVerificationExpiresAt) {
      res.status(400).json({ error: "Code expired — request a new one" });
      return;
    }

    const valid = await bcrypt.compare(code, user.emailVerificationCode);
    if (!valid) {
      await db
        .update(appUsersTable)
        .set({ emailVerificationAttempts: user.emailVerificationAttempts + 1 })
        .where(eq(appUsersTable.id, user.id));
      res.status(400).json({ error: "Incorrect code" });
      return;
    }

    const [updated] = await db
      .update(appUsersTable)
      .set({
        emailVerified: true,
        emailVerificationCode: null,
        emailVerificationExpiresAt: null,
        emailVerificationAttempts: 0,
        updatedAt: new Date(),
      })
      .where(eq(appUsersTable.id, user.id))
      .returning();

    res.json({ ok: true, user: formatUser(updated) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/resend-verification
router.post("/auth/resend-verification", async (req, res) => {
  try {
    const { email } = req.body as { email?: string };
    if (!email) {
      res.status(400).json({ error: "email is required" });
      return;
    }

    const [user] = await db.select().from(appUsersTable).where(eq(appUsersTable.email, email.toLowerCase())).limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (user.emailVerified) {
      res.status(400).json({ error: "Email is already verified" });
      return;
    }
    if (user.lastVerificationSentAt && Date.now() - user.lastVerificationSentAt.getTime() < VERIFICATION_RESEND_COOLDOWN_MS) {
      res.status(429).json({ error: "Please wait before requesting another code" });
      return;
    }

    const { code, hash } = await createVerificationCode();
    // Send before persisting: if delivery fails, the old code (and cooldown
    // window) stays intact rather than silently invalidating it for a code
    // the user will never receive.
    await sendVerificationEmail(user.email, code);

    await db
      .update(appUsersTable)
      .set({
        emailVerificationCode: hash,
        emailVerificationExpiresAt: new Date(Date.now() + VERIFICATION_CODE_TTL_MS),
        emailVerificationAttempts: 0,
        lastVerificationSentAt: new Date(),
      })
      .where(eq(appUsersTable.id, user.id));

    res.json({ ok: true });
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
