import { Router } from "express";
import { db } from "../db";
import { transactionsTable, appUsersTable } from "../db";
import { eq, sql, desc } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth.js";

const router = Router();

router.get("/admin/transactions", requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const offset = (page - 1) * limit;
    const type = (req.query.type as string) || "all";
    const userId = req.query.userId ? Number(req.query.userId) : undefined;

    let baseQuery = db
      .select({
        id: transactionsTable.id,
        userId: transactionsTable.userId,
        type: transactionsTable.type,
        productId: transactionsTable.productId,
        amountUsd: transactionsTable.amountUsd,
        store: transactionsTable.store,
        originalTransactionId: transactionsTable.originalTransactionId,
        createdAt: transactionsTable.createdAt,
        userEmail: appUsersTable.email,
        userName: appUsersTable.name,
      })
      .from(transactionsTable)
      .leftJoin(appUsersTable, eq(transactionsTable.userId, appUsersTable.id))
      .$dynamic();

    let countQuery = db.select({ count: sql<number>`count(*)::int` }).from(transactionsTable).$dynamic();

    if (type !== "all") {
      baseQuery = baseQuery.where(eq(transactionsTable.type, type));
      countQuery = countQuery.where(eq(transactionsTable.type, type));
    }
    if (userId) {
      baseQuery = baseQuery.where(eq(transactionsTable.userId, userId));
      countQuery = countQuery.where(eq(transactionsTable.userId, userId));
    }

    const [txs, [{ count: total }]] = await Promise.all([
      baseQuery.orderBy(desc(transactionsTable.createdAt)).limit(limit).offset(offset),
      countQuery,
    ]);

    res.json({
      transactions: txs.map((t) => ({
        ...t,
        amountUsd: t.amountUsd ? Number(t.amountUsd) : null,
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
