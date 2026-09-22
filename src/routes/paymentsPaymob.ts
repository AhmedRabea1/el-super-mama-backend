import { Router } from "express";
import { db } from "../db";
import { appUsersTable, programsTable, subscriptionsTable, transactionsTable } from "../db";
import { eq } from "drizzle-orm";
import { requireUser } from "../middlewares/auth.js";

const router = Router();

const PAYMOB_SECRET_KEY = process.env.PAYMOB_SECRET_KEY;
const PAYMOB_API_KEY = process.env.PAYMOB_API_KEY;
const PAYMOB_INTEGRATION_IDS = (process.env.PAYMOB_INTEGRATION_IDS ?? "")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n));

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || "NA", lastName: parts.slice(1).join(" ") || "NA" };
}

// POST /payments/paymob/intention — server-side proxy for creating a Paymob
// payment intention. PAYMOB_SECRET_KEY never leaves this server. The price
// is looked up from `programs`, never trusted from the client, so a
// tampered `amount` in the request body can't produce a cheaper intention.
router.post("/payments/paymob/intention", requireUser, async (req, res) => {
  try {
    if (!PAYMOB_SECRET_KEY || PAYMOB_INTEGRATION_IDS.length === 0) {
      console.error("[paymob/intention] PAYMOB_SECRET_KEY or PAYMOB_INTEGRATION_IDS is not configured");
      res.status(500).json({ error: "Payment provider not configured" });
      return;
    }

    const userId = req.appUser!.userId;
    const { programId } = req.body as { programId?: number };
    if (programId === undefined) {
      res.status(400).json({ error: "programId is required" });
      return;
    }

    const [user] = await db.select().from(appUsersTable).where(eq(appUsersTable.id, userId)).limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const [program] = await db.select().from(programsTable).where(eq(programsTable.id, programId)).limit(1);
    if (!program) {
      res.status(400).json({ error: "Program not found" });
      return;
    }
    if (program.priceInEgp === null) {
      res.status(400).json({ error: "Program has no EGP price configured" });
      return;
    }

    const amountCents = Math.round(program.priceInEgp * 100);
    const { firstName, lastName } = splitName(user.name);
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    // Encodes the order directly in the reference so the webhook can match
    // it back without a separate orders table — safe because Paymob's HMAC
    // signs the transaction Paymob processed, so a verified callback can only
    // carry a special_reference Paymob actually received from us.
    const specialReference = `enroll_${userId}_${programId}_${Date.now()}`;

    const paymobRes = await fetch("https://accept.paymob.com/v1/intention/", {
      method: "POST",
      headers: {
        Authorization: `Token ${PAYMOB_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountCents,
        currency: "EGP",
        payment_methods: PAYMOB_INTEGRATION_IDS,
        items: [
          {
            name: program.name,
            amount: amountCents,
            description: program.description ?? program.name,
            quantity: 1,
          },
        ],
        billing_data: {
          first_name: firstName,
          last_name: lastName,
          phone_number: user.phone ?? "NA",
          email: user.email,
          apartment: "NA",
          floor: "NA",
          street: "NA",
          building: "NA",
          city: "NA",
          state: "NA",
          country: "EG",
        },
        special_reference: specialReference,
        expiration: 3600,
        notification_url: `${baseUrl}/api/payments/paymob/webhook`,
        redirection_url: `${baseUrl}/api/payments/paymob/redirect`,
      }),
    });

    const data = (await paymobRes.json()) as { client_secret?: string };
    if (!paymobRes.ok) {
      console.error("[paymob/intention] Paymob API error:", paymobRes.status, JSON.stringify(data));
      res.status(502).json({ error: "Payment provider error" });
      return;
    }

    res.json({ clientSecret: data.client_secret });
  } catch (err) {
    console.error("[paymob/intention]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Exchanges the merchant API key for a short-lived Paymob auth token. Fetched
// fresh per webhook call rather than cached — webhook volume is low (one per
// purchase) and tokens expire, so there's no real benefit to caching this.
async function getPaymobAuthToken(): Promise<string> {
  const tokenRes = await fetch("https://accept.paymob.com/api/auth/tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: PAYMOB_API_KEY }),
  });
  const data = (await tokenRes.json()) as { token?: string; detail?: string };
  if (!tokenRes.ok || !data.token) {
    throw new Error(`Paymob auth token exchange failed: ${JSON.stringify(data)}`);
  }
  return data.token;
}

interface PaymobOrder {
  id: number;
  merchant_order_id: string | null;
  payment_status: string;
  paid_amount_cents: number;
}

async function fetchPaymobOrder(orderId: number): Promise<PaymobOrder> {
  const token = await getPaymobAuthToken();
  const orderRes = await fetch(`https://accept.paymob.com/api/ecommerce/orders/${orderId}?format=json`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await orderRes.json()) as PaymobOrder & { detail?: string };
  if (!orderRes.ok) {
    throw new Error(`Paymob order lookup failed for order ${orderId}: ${JSON.stringify(data)}`);
  }
  return data;
}

function extractOrderId(body: Record<string, unknown>): number | undefined {
  const transaction = body.transaction as Record<string, unknown> | undefined;
  const obj = body.obj as Record<string, unknown> | undefined;
  const order =
    (transaction?.order as Record<string, unknown> | undefined) ??
    (obj?.order as Record<string, unknown> | undefined);
  const id = order?.id;
  return typeof id === "number" ? id : undefined;
}

// POST /payments/paymob/webhook — this IS the `notification_url` above.
// Paymob's Intention API doesn't publish the HMAC field list/algorithm for
// this callback shape (confirmed against their own docs — HMAC is mentioned
// as a concept but the payload structure isn't documented, and it didn't
// match Paymob's older, documented Accept-API scheme either). Rather than
// trust an unverifiable signature, this looks up the order directly via
// Paymob's own API using our own credentials: an attacker sending a forged
// webhook can only trigger a lookup that comes back showing the real status,
// they can't make Paymob's API itself falsely report an order as paid.
router.post("/payments/paymob/webhook", async (req, res) => {
  try {
    if (!PAYMOB_API_KEY) {
      console.error("[paymob/webhook] PAYMOB_API_KEY is not configured");
      res.status(500).json({ error: "Payment provider not configured" });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const orderId = extractOrderId(body);
    if (orderId === undefined) {
      console.error("[paymob/webhook] Could not find an order id in payload:", JSON.stringify(body));
      res.status(400).json({ error: "Malformed webhook payload" });
      return;
    }

    const order = await fetchPaymobOrder(orderId);
    if (order.payment_status !== "PAID") {
      console.log(`[paymob/webhook] Order ${orderId} not paid yet (status: ${order.payment_status}), ignoring`);
      res.json({ message: "ok" });
      return;
    }

    const specialReference = order.merchant_order_id ?? undefined;
    const match = specialReference?.match(/^enroll_(\d+)_(\d+)_\d+$/);
    if (!match) {
      console.error("[paymob/webhook] Could not parse special_reference from order:", specialReference);
      res.status(400).json({ error: "Unrecognized order reference" });
      return;
    }
    const userId = Number(match[1]);
    const programId = Number(match[2]);

    // Idempotency: Paymob may retry webhook delivery; don't re-enroll or
    // double-log a transaction already processed for this order.
    const [existing] = await db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.originalTransactionId, String(orderId)))
      .limit(1);
    if (existing) {
      res.json({ message: "ok" });
      return;
    }

    const [program] = await db.select().from(programsTable).where(eq(programsTable.id, programId)).limit(1);
    if (!program) {
      console.error("[paymob/webhook] Program not found for reference:", specialReference);
      res.status(400).json({ error: "Program not found" });
      return;
    }

    await db
      .update(appUsersTable)
      .set({ programId, currentDay: 1, subscriptionStatus: "active", updatedAt: new Date() })
      .where(eq(appUsersTable.id, userId));

    await db.insert(subscriptionsTable).values({
      userId,
      productId: program.slug,
      status: "active",
      startsAt: new Date(),
      store: "paymob",
    });

    await db.insert(transactionsTable).values({
      userId,
      type: "purchase",
      productId: program.slug,
      amountUsd: (order.paid_amount_cents / 100).toString(),
      store: "paymob",
      originalTransactionId: String(orderId),
      raw: body,
    });

    console.log(`[paymob/webhook] Enrolled userId=${userId} into programId=${programId} via order=${orderId}`);

    res.json({ message: "ok" });
  } catch (err) {
    console.error("[paymob/webhook]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /payments/paymob/redirect — the `redirection_url` above. The native RN
// SDK flow (presentPayVC) shouldn't need this, but Paymob's API requires a
// redirection_url regardless, and some flows do briefly load it in a webview.
router.get("/payments/paymob/redirect", (_req, res) => {
  res.send("<html><body><h3>Payment complete. You can close this window.</h3></body></html>");
});

export default router;
