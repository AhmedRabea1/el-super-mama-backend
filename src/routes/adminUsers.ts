import { Router } from "express";
import { db } from "../db";
import { appUsersTable, assessmentsTable, programsTable, subscriptionsTable, transactionsTable } from "../db";
import { eq, ilike, or, sql, desc } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth.js";
import { formatAssessment } from "./users.js";

const router = Router();

// GET /api/admin/users
router.get("/admin/users", requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const offset = (page - 1) * limit;
    const search = (req.query.search as string) || "";
    const status = (req.query.status as string) || "all";

    let query = db.select().from(appUsersTable).$dynamic();
    let countQuery = db.select({ count: sql<number>`count(*)::int` }).from(appUsersTable).$dynamic();

    if (search) {
      const like = `%${search}%`;
      query = query.where(or(ilike(appUsersTable.name, like), ilike(appUsersTable.email, like)));
      countQuery = countQuery.where(or(ilike(appUsersTable.name, like), ilike(appUsersTable.email, like)));
    }
    if (status === "active") {
      query = query.where(eq(appUsersTable.isActive, true));
      countQuery = countQuery.where(eq(appUsersTable.isActive, true));
    } else if (status === "inactive") {
      query = query.where(eq(appUsersTable.isActive, false));
      countQuery = countQuery.where(eq(appUsersTable.isActive, false));
    }

    const [users, [{ count: total }]] = await Promise.all([
      query.orderBy(desc(appUsersTable.createdAt)).limit(limit).offset(offset),
      countQuery,
    ]);

    res.json({
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        phone: u.phone,
        stage: u.stage,
        programId: u.programId,
        currentDay: u.currentDay,
        isActive: u.isActive,
        subscriptionStatus: u.subscriptionStatus,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
        notes: u.notes,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/users/:userId
router.get("/admin/users/:userId", requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const [user] = await db.select().from(appUsersTable).where(eq(appUsersTable.id, userId)).limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const [subs, txs, [assessment], programRow] = await Promise.all([
      db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, userId)).orderBy(desc(subscriptionsTable.createdAt)),
      db.select().from(transactionsTable).where(eq(transactionsTable.userId, userId)).orderBy(desc(transactionsTable.createdAt)).limit(50),
      db.select().from(assessmentsTable).where(eq(assessmentsTable.userId, userId)).limit(1),
      user.programId
        ? db.select({ name: programsTable.name }).from(programsTable).where(eq(programsTable.id, user.programId)).limit(1)
        : Promise.resolve([]),
    ]);
    const programName = programRow[0]?.name ?? null;

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      stage: user.stage,
      programId: user.programId,
      programName,
      currentDay: user.currentDay,
      isActive: user.isActive,
      subscriptionStatus: user.subscriptionStatus,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      notes: user.notes,
      ...formatAssessment(assessment),
      subscriptions: subs.map((s) => ({
        id: s.id,
        userId: s.userId,
        productId: s.productId,
        status: s.status,
        startsAt: s.startsAt,
        expiresAt: s.expiresAt,
        autoRenews: s.autoRenews,
        store: s.store,
        priceUsd: s.priceUsd ? Number(s.priceUsd) : null,
        createdAt: s.createdAt,
      })),
      transactions: txs.map((t) => ({
        id: t.id,
        userId: t.userId,
        type: t.type,
        productId: t.productId,
        amountUsd: t.amountUsd ? Number(t.amountUsd) : null,
        store: t.store,
        originalTransactionId: t.originalTransactionId,
        createdAt: t.createdAt,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/admin/users/:userId
router.put("/admin/users/:userId", requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const { name, phone, isActive, notes, stage, programId } = req.body as {
      name?: string; phone?: string; isActive?: boolean; notes?: string; stage?: string; programId?: number;
    };
    const [updated] = await db
      .update(appUsersTable)
      .set({ name, phone, isActive, notes, stage, programId, updatedAt: new Date() })
      .where(eq(appUsersTable.id, userId))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({ id: updated.id, email: updated.email, name: updated.name, phone: updated.phone, stage: updated.stage, programId: updated.programId, currentDay: updated.currentDay, isActive: updated.isActive, subscriptionStatus: updated.subscriptionStatus, createdAt: updated.createdAt, lastLoginAt: updated.lastLoginAt, notes: updated.notes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/admin/users/:userId
router.delete("/admin/users/:userId", requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    await db.delete(appUsersTable).where(eq(appUsersTable.id, userId));
    res.json({ message: "User deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
