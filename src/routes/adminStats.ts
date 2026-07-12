import { Router } from "express";
import { db } from "../db";
import { appUsersTable, subscriptionsTable, transactionsTable } from "../db";
import { and, eq, gte, sql, desc } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth.js";

const router = Router();

router.get("/admin/stats", requireAdmin, async (_req, res) => {
  try {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [[{ totalUsers }]] = await Promise.all([
      db.select({ totalUsers: sql<number>`count(*)::int` }).from(appUsersTable),
    ]);

    const [{ activeSubscriptions }] = await db
      .select({ activeSubscriptions: sql<number>`count(*)::int` })
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.status, "active"));

    const [{ totalRevenue }] = await db
      .select({ totalRevenue: sql<number>`coalesce(sum(amount_usd::numeric), 0)::float` })
      .from(transactionsTable)
      .where(eq(transactionsTable.type, "purchase"));

    const [{ newUsersThisMonth }] = await db
      .select({ newUsersThisMonth: sql<number>`count(*)::int` })
      .from(appUsersTable)
      .where(gte(appUsersTable.createdAt, firstOfMonth));

    const [{ churnedThisMonth }] = await db
      .select({ churnedThisMonth: sql<number>`count(*)::int` })
      .from(transactionsTable)
      .where(and(
        eq(transactionsTable.type, "cancellation"),
        gte(transactionsTable.createdAt, firstOfMonth),
      ));

    const [{ revenueThisMonth }] = await db
      .select({ revenueThisMonth: sql<number>`coalesce(sum(amount_usd::numeric), 0)::float` })
      .from(transactionsTable)
      .where(and(
        eq(transactionsTable.type, "purchase"),
        gte(transactionsTable.createdAt, firstOfMonth),
      ));

    const recentTransactions = await db
      .select({
        id: transactionsTable.id,
        userId: transactionsTable.userId,
        type: transactionsTable.type,
        productId: transactionsTable.productId,
        amountUsd: sql<number>`coalesce(${transactionsTable.amountUsd}::float, 0)`,
        store: transactionsTable.store,
        originalTransactionId: transactionsTable.originalTransactionId,
        createdAt: transactionsTable.createdAt,
        userEmail: appUsersTable.email,
        userName: appUsersTable.name,
      })
      .from(transactionsTable)
      .leftJoin(appUsersTable, eq(transactionsTable.userId, appUsersTable.id))
      .orderBy(desc(transactionsTable.createdAt))
      .limit(10);

    // Last 6 months of growth data
    const userGrowth = await db.execute(sql`
      SELECT
        to_char(date_trunc('month', generate_series), 'Mon YYYY') AS month,
        (SELECT count(*)::int FROM app_users WHERE created_at < generate_series + interval '1 month' AND created_at >= generate_series) AS users,
        (SELECT coalesce(sum(amount_usd::numeric), 0)::float FROM transactions WHERE type = 'purchase' AND created_at >= generate_series AND created_at < generate_series + interval '1 month') AS revenue
      FROM generate_series(
        date_trunc('month', now()) - interval '5 months',
        date_trunc('month', now()),
        interval '1 month'
      ) AS generate_series
      ORDER BY generate_series ASC
    `);

    res.json({
      totalUsers,
      activeSubscriptions,
      totalRevenue,
      newUsersThisMonth,
      churnedThisMonth,
      revenueThisMonth,
      recentTransactions,
      userGrowth: userGrowth.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
