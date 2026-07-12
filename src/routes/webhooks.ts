import { Router } from "express";
import { db } from "../db";
import { transactionsTable, subscriptionsTable, appUsersTable } from "../db";
import { eq } from "drizzle-orm";

const router = Router();

// POST /api/webhooks/revenuecat
router.post("/webhooks/revenuecat", async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const event = body.event as Record<string, unknown> | undefined;
    if (!event) {
      res.status(400).json({ error: "Missing event" });
      return;
    }

    const type = (event.type as string)?.toLowerCase() ?? "unknown";
    const appUserId = event.app_user_id as string | undefined;
    const productId = event.product_id as string | undefined;
    const revenue = event.price as number | undefined;
    const store = event.store as string | undefined;
    const transactionId = event.transaction_id as string | undefined;

    // Find matching app user by RevenueCat user ID (matches email or id)
    let userId: number | null = null;
    if (appUserId) {
      const numericId = Number(appUserId);
      if (!isNaN(numericId)) {
        const [user] = await db.select().from(appUsersTable).where(eq(appUsersTable.id, numericId)).limit(1);
        if (user) userId = user.id;
      } else {
        const [user] = await db.select().from(appUsersTable).where(eq(appUsersTable.email, appUserId.toLowerCase())).limit(1);
        if (user) userId = user.id;
      }
    }

    // Record transaction
    await db.insert(transactionsTable).values({
      userId,
      type: mapEventType(type),
      productId,
      amountUsd: revenue?.toString(),
      store,
      originalTransactionId: transactionId,
      raw: body,
    });

    // Update subscription status
    if (userId) {
      if (["initial_purchase", "renewal"].includes(type)) {
        await db.update(appUsersTable).set({ subscriptionStatus: "active" }).where(eq(appUsersTable.id, userId));
        const expiresAt = event.expiration_at_ms ? new Date(event.expiration_at_ms as number) : undefined;
        await db.insert(subscriptionsTable).values({
          userId,
          productId: productId ?? "unknown",
          status: "active",
          startsAt: new Date(),
          expiresAt,
          autoRenews: true,
          store,
          priceUsd: revenue?.toString(),
        }).onConflictDoNothing();
      } else if (["cancellation", "expiration"].includes(type)) {
        await db.update(appUsersTable).set({ subscriptionStatus: type === "cancellation" ? "cancelled" : "expired" }).where(eq(appUsersTable.id, userId));
      }
    }

    res.json({ message: "ok" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

function mapEventType(rcType: string): string {
  const map: Record<string, string> = {
    initial_purchase: "purchase",
    renewal: "renewal",
    cancellation: "cancellation",
    expiration: "cancellation",
    refund: "refund",
    product_change: "purchase",
  };
  return map[rcType] ?? rcType;
}

export default router;
