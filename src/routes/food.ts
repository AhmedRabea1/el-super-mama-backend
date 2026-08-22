import { Router, Request, Response, NextFunction } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import { appUsersTable } from "../db";
import { eq, and, lt, sql } from "drizzle-orm";
import { requireUser } from "../middlewares/auth.js";

const router = Router();

// Reads ANTHROPIC_API_KEY from the environment.
const anthropic = new Anthropic();

const MODEL = "claude-haiku-4-5-20251001";
const TRIAL_LIMIT = 5;

const FOOD_ESTIMATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string", description: "Clean food name (short, capitalized)" },
    assumedPortion: {
      type: "string",
      description: "The specific portion/serving size you assumed, e.g. '1 medium banana (118g)' — always state it explicitly, especially when the user's description was vague",
    },
    calories: { type: "number" },
    protein: { type: "number" },
    carbs: { type: "number" },
    fat: { type: "number" },
    confidence: {
      type: "string",
      enum: ["high", "medium", "low"],
      description: "high = specific common food with clear portion, medium = reasonable inference needed, low = vague/unusual description with large uncertainty",
    },
    explanation: { type: "string", description: "1-2 sentence explanation of your estimates, referencing standard nutrition data (e.g. USDA-style values) for the components used" },
  },
  required: ["name", "assumedPortion", "calories", "protein", "carbs", "fat", "confidence", "explanation"],
} as const;

// Gate: only subscribed users may call the AI estimate endpoint.
async function requireActiveSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.appUser!.userId;
    const [user] = await db.select().from(appUsersTable).where(eq(appUsersTable.id, userId)).limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (user.subscriptionStatus !== "active") {
      res.status(403).json({ error: "Active subscription required" });
      return;
    }
    next();
  } catch (err) {
    console.error("[requireActiveSubscription]", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

router.post("/food/estimate", requireUser, requireActiveSubscription, async (req, res) => {
  const userId = req.appUser!.userId;
  const { description } = req.body as { description?: string };

  if (!description || typeof description !== "string" || !description.trim()) {
    res.status(400).json({ error: "Food description is required" });
    return;
  }

  try {
    // Atomically claim one trial: the UPDATE only matches (and only then
    // increments) if the user is still under the limit, so this is the limit
    // check and the increment in a single statement — no race window between
    // two concurrent requests both reading "4 used" and both proceeding.
    const [claimed] = await db
      .update(appUsersTable)
      .set({ aiFoodEstimateCount: sql`${appUsersTable.aiFoodEstimateCount} + 1` })
      .where(and(eq(appUsersTable.id, userId), lt(appUsersTable.aiFoodEstimateCount, TRIAL_LIMIT)))
      .returning({ aiFoodEstimateCount: appUsersTable.aiFoodEstimateCount });

    if (!claimed) {
      res.status(403).json({ error: "AI estimate limit reached", trialsUsed: TRIAL_LIMIT, trialsRemaining: 0 });
      return;
    }

    const trialsRemaining = TRIAL_LIMIT - claimed.aiFoodEstimateCount;

    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: `You are a meticulous registered-dietitian-grade nutrition estimator. Given a food description, estimate its nutritional content as accurately as possible.

Reasoning approach:
1. Identify each distinct food/ingredient mentioned.
2. For each, recall standard reference nutrition values (as in USDA FoodData Central) for a typical preparation and serving size.
3. If the description is vague (e.g. "a bowl of pasta", "some chicken"), pick the most common realistic portion size for that food and state exactly what you assumed in "assumedPortion" — never silently guess without disclosing it.
4. Sum values across ingredients, accounting for cooking method (fried vs. grilled vs. boiled changes calories/fat significantly) and any mentioned add-ons (oil, butter, sauce, cheese, etc.).
5. Rate your own "confidence" honestly: "high" only when the food and portion are unambiguous.

Round calories to the nearest 5 and macros (protein/carbs/fat in grams) to the nearest 1.`,
      messages: [{ role: "user", content: description.trim() }],
      tools: [
        {
          name: "log_food_estimate",
          description: "Record a nutritional estimate for a described meal",
          input_schema: FOOD_ESTIMATE_SCHEMA as unknown as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: "log_food_estimate" },
    });

    const toolUse = msg.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    if (!toolUse) {
      console.error(`[food/estimate] No tool_use block in ${MODEL} response:`, JSON.stringify(msg.content));
      res.status(500).json({ error: "AI did not return a structured estimate. Please try again." });
      return;
    }

    const parsed = toolUse.input as {
      name: string;
      assumedPortion: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      confidence: "high" | "medium" | "low";
      explanation: string;
    };

    res.json({
      name: String(parsed.name ?? "Food"),
      assumedPortion: String(parsed.assumedPortion ?? ""),
      calories: Math.round(Number(parsed.calories) || 0),
      protein: Math.round(Number(parsed.protein) || 0),
      carbs: Math.round(Number(parsed.carbs) || 0),
      fat: Math.round(Number(parsed.fat) || 0),
      confidence: parsed.confidence === "high" || parsed.confidence === "medium" || parsed.confidence === "low" ? parsed.confidence : "medium",
      explanation: String(parsed.explanation ?? ""),
      trialsRemaining,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[food/estimate] ${MODEL} call failed:`, message);
    res.status(500).json({ error: `AI error: ${message}` });
  }
});

export default router;
