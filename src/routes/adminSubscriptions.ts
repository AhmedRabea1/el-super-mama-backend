import { Router } from "express";
import { db } from "../db";
import { subscriptionsTable, appUsersTable } from "../db";
import { eq, sql, desc } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth.js";

const router = Router();

router.get("/admin/subscriptions", requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const offset = (page - 1) * limit;
    const status = (req.query.status as string) || "all";

    let baseQuery = db
      .select({
        id: subscriptionsTable.id,
        userId: subscriptionsTable.userId,
        productId: subscriptionsTable.productId,
        status: subscriptionsTable.status,
        startsAt: subscriptionsTable.startsAt,
        expiresAt: subscriptionsTable.expiresAt,
        autoRenews: subscriptionsTable.autoRenews,
        store: subscriptionsTable.store,
        priceUsd: subscriptionsTable.priceUsd,
        createdAt: subscriptionsTable.createdAt,
        userEmail: appUsersTable.email,
        userName: appUsersTable.name,
      })
      .from(subscriptionsTable)
      .leftJoin(appUsersTable, eq(subscriptionsTable.userId, appUsersTable.id))
      .$dynamic();

    let countQuery = db.select({ count: sql<number>`count(*)::int` }).from(subscriptionsTable).$dynamic();

    if (status !== "all") {
      baseQuery = baseQuery.where(eq(subscriptionsTable.status, status));
      countQuery = countQuery.where(eq(subscriptionsTable.status, status));
    }

    const [subs, [{ count: total }]] = await Promise.all([
      baseQuery.orderBy(desc(subscriptionsTable.createdAt)).limit(limit).offset(offset),
      countQuery,
    ]);

    res.json({
      subscriptions: subs.map((s) => ({
        ...s,
        priceUsd: s.priceUsd ? Number(s.priceUsd) : null,
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

export default router;
