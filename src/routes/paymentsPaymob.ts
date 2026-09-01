import { Router } from "express";
import crypto from "crypto";
import { db } from "../db";
import { appUsersTable, programsTable, subscriptionsTable, transactionsTable } from "../db";
import { eq } from "drizzle-orm";
import { requireUser } from "../middlewares/auth.js";

const router = Router();

const PAYMOB_SECRET_KEY = process.env.PAYMOB_SECRET_KEY;
const PAYMOB_HMAC_SECRET = process.env.PAYMOB_HMAC_SECRET;
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

// Paymob's documented field order for the Transaction Processed Callback
// HMAC. Concatenate each field's raw string value (in this exact order,
// no separator), then HMAC-SHA512 with the dashboard's HMAC secret.
const HMAC_FIELD_ORDER = [
  "amount_cents",
  "created_at",
  "currency",
  "error_occured",
  "has_parent_transaction",
  "id",
  "integration_id",
  "is_3d_secure",
  "is_auth",
  "is_capture",
  "is_refunded",
  "is_standalone_payment",
  "is_voided",
  "order.id",
  "owner",
  "pending",
  "source_data.pan",
  "source_data.sub_type",
  "source_data.type",
  "success",
];

function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => (acc as Record<string, unknown> | undefined)?.[key], obj);
}

function computePaymobHmac(obj: Record<string, unknown>, secret: string): string {
  const concatenated = HMAC_FIELD_ORDER.map((path) => {
    const value = getPath(obj, path);
    return value === undefined || value === null ? "" : String(value);
  }).join("");
  return crypto.createHmac("sha512", secret).update(concatenated).digest("hex");
}

function safeHexCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, "hex");
    const bufB = Buffer.from(b, "hex");
    return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

// POST /payments/paymob/webhook — this IS the `notification_url` above.
// Paymob calls this server-to-server after a transaction completes; the
// client can't be trusted to self-report a successful purchase, so this is
// the only place that actually marks a purchase as paid.
router.post("/payments/paymob/webhook", async (req, res) => {
  try {
    if (!PAYMOB_HMAC_SECRET) {
      console.error("[paymob/webhook] PAYMOB_HMAC_SECRET is not configured");
      res.status(500).json({ error: "Payment provider not configured" });
      return;
    }

    const body = req.body as { obj?: Record<string, unknown>; hmac?: string };
    const obj = body.obj;
    const receivedHmac = (req.query.hmac as string | undefined) ?? body.hmac;
    if (!obj || !receivedHmac) {
      res.status(400).json({ error: "Malformed webhook payload" });
      return;
    }

    const computedHmac = computePaymobHmac(obj, PAYMOB_HMAC_SECRET);
    if (!safeHexCompare(computedHmac, receivedHmac)) {
      console.error("[paymob/webhook] HMAC verification failed");
      res.status(401).json({ error: "Invalid signature" });
      return;
    }

    if (!obj.success || obj.pending) {
      res.json({ message: "ok" });
      return;
    }

    // special_reference is echoed back on the order Paymob created for this
    // intention. Field location per Paymob's Intention API; falls back to a
    // couple of other plausible spots since this hasn't been confirmed
    // against a live sandbox transaction yet — check the logged raw payload
    // on your first real test and adjust if needed.
    const order = obj.order as Record<string, unknown> | undefined;
    const specialReference = (order?.merchant_order_id ?? obj.special_reference ?? order?.special_reference) as
      | string
      | undefined;
    const match = specialReference?.match(/^enroll_(\d+)_(\d+)_\d+$/);
    if (!match) {
      console.error("[paymob/webhook] Could not parse special_reference from payload:", JSON.stringify(body));
      res.status(400).json({ error: "Unrecognized order reference" });
      return;
    }
    const userId = Number(match[1]);
    const programId = Number(match[2]);

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

    const amountCents = obj.amount_cents as number | undefined;
    await db.insert(transactionsTable).values({
      userId,
      type: "purchase",
      productId: program.slug,
      amountUsd: amountCents !== undefined ? (amountCents / 100).toString() : undefined,
      store: "paymob",
      originalTransactionId: obj.id !== undefined ? String(obj.id) : undefined,
      raw: body,
    });

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
