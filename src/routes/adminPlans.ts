import { Router } from "express";
import { db } from "../db";
import { plansTable, planMealsTable, recipesTable } from "../db";
import { eq, asc } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth.js";

const router = Router();

type MealInput = { mealType?: string; recipeId?: number };
type PlanBody = { name?: string; meals?: MealInput[] };

function cleanMeals(meals: MealInput[] | undefined): { mealType: string; recipeId: number }[] {
  return (meals ?? [])
    .filter((m) => m.mealType?.trim() && Number.isFinite(Number(m.recipeId)))
    .map((m) => ({ mealType: m.mealType!.trim(), recipeId: Number(m.recipeId) }));
}

async function getMealsForPlan(planId: number) {
  return db
    .select({
      id: planMealsTable.id,
      mealType: planMealsTable.mealType,
      recipeId: planMealsTable.recipeId,
      recipe: recipesTable,
    })
    .from(planMealsTable)
    .leftJoin(recipesTable, eq(planMealsTable.recipeId, recipesTable.id))
    .where(eq(planMealsTable.planId, planId))
    .orderBy(asc(planMealsTable.id));
}

// GET /api/admin/plans
router.get("/admin/plans", requireAdmin, async (_req, res) => {
  try {
    const plans = await db.select().from(plansTable).orderBy(asc(plansTable.createdAt));
    const plansWithMeals = await Promise.all(
      plans.map(async (plan) => ({ ...plan, meals: await getMealsForPlan(plan.id) }))
    );
    res.json({ plans: plansWithMeals });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/plans/:planId
router.get("/admin/plans/:planId", requireAdmin, async (req, res) => {
  try {
    const planId = Number(req.params.planId);
    const [plan] = await db.select().from(plansTable).where(eq(plansTable.id, planId)).limit(1);
    if (!plan) {
      res.status(404).json({ error: "Plan not found" });
      return;
    }
    const meals = await getMealsForPlan(planId);
    res.json({ ...plan, meals });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/plans
router.post("/admin/plans", requireAdmin, async (req, res) => {
  try {
    const body = req.body as PlanBody;
    if (!body.name?.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const meals = cleanMeals(body.meals);
    const plan = await db.transaction(async (tx) => {
      const [created] = await tx.insert(plansTable).values({ name: body.name!.trim() }).returning();
      if (meals.length > 0) {
        await tx.insert(planMealsTable).values(meals.map((m) => ({ planId: created.id, ...m })));
      }
      return created;
    });
    res.status(201).json({ ...plan, meals: await getMealsForPlan(plan.id) });
  } catch (err: any) {
    const pgCode = err?.code ?? err?.cause?.code;
    if (pgCode === "23503") {
      res.status(400).json({ error: "One or more recipeId values do not exist" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/admin/plans/:planId — full edit: name + full meals replacement
router.put("/admin/plans/:planId", requireAdmin, async (req, res) => {
  try {
    const planId = Number(req.params.planId);
    const body = req.body as PlanBody;
    if (!body.name?.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const meals = cleanMeals(body.meals);
    const updated = await db.transaction(async (tx) => {
      const [plan] = await tx
        .update(plansTable)
        .set({ name: body.name!.trim(), updatedAt: new Date() })
        .where(eq(plansTable.id, planId))
        .returning();
      if (!plan) return null;
      await tx.delete(planMealsTable).where(eq(planMealsTable.planId, planId));
      if (meals.length > 0) {
        await tx.insert(planMealsTable).values(meals.map((m) => ({ planId, ...m })));
      }
      return plan;
    });
    if (!updated) {
      res.status(404).json({ error: "Plan not found" });
      return;
    }
    res.json({ ...updated, meals: await getMealsForPlan(planId) });
  } catch (err: any) {
    const pgCode = err?.code ?? err?.cause?.code;
    if (pgCode === "23503") {
      res.status(400).json({ error: "One or more recipeId values do not exist" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/admin/plans/:planId — partial: name and/or meals (meals only replaced if provided)
router.patch("/admin/plans/:planId", requireAdmin, async (req, res) => {
  try {
    const planId = Number(req.params.planId);
    const body = req.body as PlanBody;
    if (body.name !== undefined && !body.name.trim()) {
      res.status(400).json({ error: "name cannot be empty" });
      return;
    }
    const updated = await db.transaction(async (tx) => {
      const [plan] = await tx
        .update(plansTable)
        .set({ name: body.name?.trim(), updatedAt: new Date() })
        .where(eq(plansTable.id, planId))
        .returning();
      if (!plan) return null;
      if (body.meals !== undefined) {
        const meals = cleanMeals(body.meals);
        await tx.delete(planMealsTable).where(eq(planMealsTable.planId, planId));
        if (meals.length > 0) {
          await tx.insert(planMealsTable).values(meals.map((m) => ({ planId, ...m })));
        }
      }
      return plan;
    });
    if (!updated) {
      res.status(404).json({ error: "Plan not found" });
      return;
    }
    res.json({ ...updated, meals: await getMealsForPlan(planId) });
  } catch (err: any) {
    const pgCode = err?.code ?? err?.cause?.code;
    if (pgCode === "23503") {
      res.status(400).json({ error: "One or more recipeId values do not exist" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/plans/:planId/duplicate
router.post("/admin/plans/:planId/duplicate", requireAdmin, async (req, res) => {
  try {
    const planId = Number(req.params.planId);
    const [plan] = await db.select().from(plansTable).where(eq(plansTable.id, planId)).limit(1);
    if (!plan) {
      res.status(404).json({ error: "Plan not found" });
      return;
    }
    const meals = await db.select().from(planMealsTable).where(eq(planMealsTable.planId, planId)).orderBy(asc(planMealsTable.id));

    const newPlan = await db.transaction(async (tx) => {
      const [created] = await tx.insert(plansTable).values({ name: `${plan.name} (Copy)` }).returning();
      if (meals.length > 0) {
        await tx.insert(planMealsTable).values(meals.map((m) => ({ planId: created.id, mealType: m.mealType, recipeId: m.recipeId })));
      }
      return created;
    });

    res.status(201).json({ ...newPlan, meals: await getMealsForPlan(newPlan.id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/admin/plans/:planId
router.delete("/admin/plans/:planId", requireAdmin, async (req, res) => {
  try {
    const planId = Number(req.params.planId);
    const [deleted] = await db.delete(plansTable).where(eq(plansTable.id, planId)).returning();
    if (!deleted) {
      res.status(404).json({ error: "Plan not found" });
      return;
    }
    res.json({ message: "Deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
