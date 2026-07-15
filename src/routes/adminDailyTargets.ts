import { Router } from "express";
import { db } from "../db";
import { dailyTargetsTable } from "../db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth.js";

const router = Router();

type DailyTargetBody = {
  dailyCalories?: number;
  protein?: number;
  carbs?: number;
  fats?: number;
  fibers?: number;
  waterTarget?: number;
  supplements?: string[];
};

// POST /api/admin/phases/:phaseId/daily-targets
router.post("/admin/phases/:phaseId/daily-targets", requireAdmin, async (req, res) => {
  try {
    const phaseId = Number(req.params.phaseId);
    const body = req.body as DailyTargetBody;
    const [dailyTarget] = await db
      .insert(dailyTargetsTable)
      .values({
        phaseId,
        dailyCalories: body.dailyCalories,
        protein: body.protein,
        carbs: body.carbs,
        fats: body.fats,
        fibers: body.fibers,
        waterTarget: body.waterTarget,
        supplements: body.supplements ?? [],
      })
      .returning();
    res.status(201).json(dailyTarget);
  } catch (err: any) {
    const pgCode = err?.code ?? err?.cause?.code;
    if (pgCode === "23505") {
      res.status(409).json({ error: "Daily targets already exist for this phase — use PATCH to update them" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/phases/:phaseId/daily-targets
router.get("/admin/phases/:phaseId/daily-targets", requireAdmin, async (req, res) => {
  try {
    const phaseId = Number(req.params.phaseId);
    const [dailyTarget] = await db
      .select()
      .from(dailyTargetsTable)
      .where(eq(dailyTargetsTable.phaseId, phaseId))
      .limit(1);
    if (!dailyTarget) {
      res.status(404).json({ error: "No daily targets configured for this phase" });
      return;
    }
    res.json(dailyTarget);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/daily-targets/:dailyTargetId
router.get("/admin/daily-targets/:dailyTargetId", requireAdmin, async (req, res) => {
  try {
    const dailyTargetId = Number(req.params.dailyTargetId);
    const [dailyTarget] = await db
      .select()
      .from(dailyTargetsTable)
      .where(eq(dailyTargetsTable.id, dailyTargetId))
      .limit(1);
    if (!dailyTarget) {
      res.status(404).json({ error: "Daily targets not found" });
      return;
    }
    res.json(dailyTarget);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/admin/daily-targets/:dailyTargetId
router.patch("/admin/daily-targets/:dailyTargetId", requireAdmin, async (req, res) => {
  try {
    const dailyTargetId = Number(req.params.dailyTargetId);
    const body = req.body as DailyTargetBody;
    const [updated] = await db
      .update(dailyTargetsTable)
      .set({
        dailyCalories: body.dailyCalories,
        protein: body.protein,
        carbs: body.carbs,
        fats: body.fats,
        fibers: body.fibers,
        waterTarget: body.waterTarget,
        supplements: body.supplements,
        updatedAt: new Date(),
      })
      .where(eq(dailyTargetsTable.id, dailyTargetId))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Daily targets not found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/admin/daily-targets/:dailyTargetId
router.delete("/admin/daily-targets/:dailyTargetId", requireAdmin, async (req, res) => {
  try {
    const dailyTargetId = Number(req.params.dailyTargetId);
    const [deleted] = await db.delete(dailyTargetsTable).where(eq(dailyTargetsTable.id, dailyTargetId)).returning();
    if (!deleted) {
      res.status(404).json({ error: "Daily targets not found" });
      return;
    }
    res.json({ message: "Deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
