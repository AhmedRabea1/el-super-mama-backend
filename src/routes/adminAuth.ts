import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "../db";
import { adminUsersTable } from "../db";
import { eq } from "drizzle-orm";
import { requireAdmin, signAdminToken } from "../middlewares/auth.js";

const router = Router();

// POST /api/admin/auth/login
router.post("/admin/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }
    const [admin] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.email, email.toLowerCase())).limit(1);
    if (!admin || !admin.isActive) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const token = signAdminToken({ adminId: admin.id, email: admin.email, role: admin.role });
    res.json({
      token,
      admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role, createdAt: admin.createdAt },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/auth/logout
router.post("/admin/auth/logout", requireAdmin, (_req, res) => {
  res.json({ message: "Logged out" });
});

// GET /api/admin/auth/me
router.get("/admin/auth/me", requireAdmin, async (req, res) => {
  try {
    const [admin] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.id, req.admin!.adminId)).limit(1);
    if (!admin) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    res.json({ id: admin.id, email: admin.email, name: admin.name, role: admin.role, createdAt: admin.createdAt });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
