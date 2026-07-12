import { Router } from "express";
import OpenAI from "openai";

const router = Router();

const openai = new OpenAI({
  baseURL: process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"],
  apiKey: process.env["AI_INTEGRATIONS_OPENAI_API_KEY"] ?? "dummy",
});

const MODEL = "gpt-5.4";

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

router.post("/food/estimate", async (req, res) => {
  const { description } = req.body as { description?: string };

  if (!description || typeof description !== "string" || !description.trim()) {
    res.status(400).json({ error: "Food description is required" });
    return;
  }

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      max_completion_tokens: 512,
      messages: [
        {
          role: "system",
          content: `You are a meticulous registered-dietitian-grade nutrition estimator. Given a food description, estimate its nutritional content as accurately as possible.

Reasoning approach:
1. Identify each distinct food/ingredient mentioned.
2. For each, recall standard reference nutrition values (as in USDA FoodData Central) for a typical preparation and serving size.
3. If the description is vague (e.g. "a bowl of pasta", "some chicken"), pick the most common realistic portion size for that food and state exactly what you assumed in "assumedPortion" — never silently guess without disclosing it.
4. Sum values across ingredients, accounting for cooking method (fried vs. grilled vs. boiled changes calories/fat significantly) and any mentioned add-ons (oil, butter, sauce, cheese, etc.).
5. Rate your own "confidence" honestly: "high" only when the food and portion are unambiguous.

Respond ONLY with a valid JSON object matching the provided schema — no markdown, no code fences, no text before or after.

Round calories to the nearest 5 and macros (protein/carbs/fat in grams) to the nearest 1.`,
        },
        {
          role: "user",
          content: description.trim(),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "food_estimate",
          strict: true,
          schema: FOOD_ESTIMATE_SCHEMA,
        },
      },
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    console.log(`[food/estimate] ${MODEL} raw="${raw.slice(0, 300)}"`);

    if (!raw.trim()) {
      console.error(`[food/estimate] Empty response from ${MODEL}. Full completion:`, JSON.stringify(completion));
      res.status(500).json({ error: "AI returned an empty response. Please try again." });
      return;
    }

    let parsed: {
      name: string;
      assumedPortion: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      confidence: "high" | "medium" | "low";
      explanation: string;
    };

    try {
      parsed = JSON.parse(raw);
    } catch (parseErr) {
      console.error("[food/estimate] JSON parse failed:", parseErr, "raw:", raw);
      res.status(500).json({ error: "AI response could not be parsed. Please try again." });
      return;
    }

    res.json({
      name: String(parsed.name ?? "Food"),
      assumedPortion: String(parsed.assumedPortion ?? ""),
      calories: Math.round(Number(parsed.calories) || 0),
      protein: Math.round(Number(parsed.protein) || 0),
      carbs: Math.round(Number(parsed.carbs) || 0),
      fat: Math.round(Number(parsed.fat) || 0),
      confidence: parsed.confidence === "high" || parsed.confidence === "medium" || parsed.confidence === "low" ? parsed.confidence : "medium",
      explanation: String(parsed.explanation ?? ""),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[food/estimate] ${MODEL} call failed:`, message);
    res.status(500).json({ error: `AI error: ${message}` });
  }
});

export default router;
