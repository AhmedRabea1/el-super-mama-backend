import { Router } from "express";
import { db } from "../db";
import { foodTipsTable } from "../db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth.js";

const router = Router();

type FoodTipsBody = {
  foodsToFocus?: string[];
  foodsToLimit?: string[];
  monthlyTips?: string[];
};

// POST /api/admin/phases/:phaseId/food-tips
router.post("/admin/phases/:phaseId/food-tips", requireAdmin, async (req, res) => {
  try {
    const phaseId = Number(req.params.phaseId);
    const body = req.body as FoodTipsBody;
    const [foodTips] = await db
      .insert(foodTipsTable)
      .values({
        phaseId,
        foodsToFocus: body.foodsToFocus ?? [],
        foodsToLimit: body.foodsToLimit ?? [],
        monthlyTips: body.monthlyTips ?? [],
      })
      .returning();
    res.status(201).json(foodTips);
  } catch (err: any) {
    const pgCode = err?.code ?? err?.cause?.code;
    if (pgCode === "23505") {
      res.status(409).json({ error: "Food & tips already exist for this phase — use PATCH to update them" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/phases/:phaseId/food-tips
router.get("/admin/phases/:phaseId/food-tips", requireAdmin, async (req, res) => {
  try {
    const phaseId = Number(req.params.phaseId);
    const [foodTips] = await db
      .select()
      .from(foodTipsTable)
      .where(eq(foodTipsTable.phaseId, phaseId))
      .limit(1);
    if (!foodTips) {
      res.status(404).json({ error: "No food & tips configured for this phase" });
      return;
    }
    res.json(foodTips);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/food-tips/:foodTipsId
router.get("/admin/food-tips/:foodTipsId", requireAdmin, async (req, res) => {
  try {
    const foodTipsId = Number(req.params.foodTipsId);
    const [foodTips] = await db
      .select()
      .from(foodTipsTable)
      .where(eq(foodTipsTable.id, foodTipsId))
      .limit(1);
    if (!foodTips) {
      res.status(404).json({ error: "Food & tips not found" });
      return;
    }
    res.json(foodTips);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/admin/food-tips/:foodTipsId
router.patch("/admin/food-tips/:foodTipsId", requireAdmin, async (req, res) => {
  try {
    const foodTipsId = Number(req.params.foodTipsId);
    const body = req.body as FoodTipsBody;
    const [updated] = await db
      .update(foodTipsTable)
      .set({
        foodsToFocus: body.foodsToFocus,
        foodsToLimit: body.foodsToLimit,
        monthlyTips: body.monthlyTips,
        updatedAt: new Date(),
      })
      .where(eq(foodTipsTable.id, foodTipsId))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Food & tips not found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/admin/food-tips/:foodTipsId
router.delete("/admin/food-tips/:foodTipsId", requireAdmin, async (req, res) => {
  try {
    const foodTipsId = Number(req.params.foodTipsId);
    const [deleted] = await db.delete(foodTipsTable).where(eq(foodTipsTable.id, foodTipsId)).returning();
    if (!deleted) {
      res.status(404).json({ error: "Food & tips not found" });
      return;
    }
    res.json({ message: "Deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
