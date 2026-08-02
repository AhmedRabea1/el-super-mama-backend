import { Router } from "express";
import { db } from "../db";
import { recipesTable } from "../db";
import { eq, ilike, sql, desc } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth.js";

const router = Router();

type RecipeBody = {
  name?: string;
  description?: string;
  imageUrl?: string;
  videoUrl?: string;
  servingSize?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fats?: number;
  ingredients?: string[];
  steps?: string[];
  foodSwaps?: string[];
  notes?: string;
};

// GET /api/admin/recipes?page=1&limit=25&search=pasta
router.get("/admin/recipes", requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const offset = (page - 1) * limit;
    const search = (req.query.search as string) || "";

    let query = db.select().from(recipesTable).$dynamic();
    let countQuery = db.select({ count: sql<number>`count(*)::int` }).from(recipesTable).$dynamic();

    if (search) {
      const like = `%${search}%`;
      query = query.where(ilike(recipesTable.name, like));
      countQuery = countQuery.where(ilike(recipesTable.name, like));
    }

    const [recipes, [{ count: total }]] = await Promise.all([
      query.orderBy(desc(recipesTable.createdAt)).limit(limit).offset(offset),
      countQuery,
    ]);

    res.json({
      recipes,
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

// GET /api/admin/recipes/:recipeId
router.get("/admin/recipes/:recipeId", requireAdmin, async (req, res) => {
  try {
    const recipeId = Number(req.params.recipeId);
    const [recipe] = await db.select().from(recipesTable).where(eq(recipesTable.id, recipeId)).limit(1);
    if (!recipe) {
      res.status(404).json({ error: "Recipe not found" });
      return;
    }
    res.json(recipe);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/recipes
router.post("/admin/recipes", requireAdmin, async (req, res) => {
  try {
    const body = req.body as RecipeBody;
    if (!body.name?.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const [recipe] = await db
      .insert(recipesTable)
      .values({
        name: body.name.trim(),
        description: body.description,
        imageUrl: body.imageUrl,
        videoUrl: body.videoUrl,
        servingSize: body.servingSize,
        calories: body.calories,
        protein: body.protein,
        carbs: body.carbs,
        fats: body.fats,
        ingredients: body.ingredients ?? [],
        steps: body.steps ?? [],
        foodSwaps: body.foodSwaps ?? [],
        notes: body.notes,
      })
      .returning();
    res.status(201).json(recipe);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/admin/recipes/:recipeId — full replace: omitted optional fields are cleared
router.put("/admin/recipes/:recipeId", requireAdmin, async (req, res) => {
  try {
    const recipeId = Number(req.params.recipeId);
    const body = req.body as RecipeBody;
    if (!body.name?.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const [updated] = await db
      .update(recipesTable)
      .set({
        name: body.name.trim(),
        description: body.description ?? null,
        imageUrl: body.imageUrl ?? null,
        videoUrl: body.videoUrl ?? null,
        servingSize: body.servingSize ?? null,
        calories: body.calories ?? null,
        protein: body.protein ?? null,
        carbs: body.carbs ?? null,
        fats: body.fats ?? null,
        ingredients: body.ingredients ?? [],
        steps: body.steps ?? [],
        foodSwaps: body.foodSwaps ?? [],
        notes: body.notes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(recipesTable.id, recipeId))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Recipe not found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/admin/recipes/:recipeId — partial update: only provided fields change
router.patch("/admin/recipes/:recipeId", requireAdmin, async (req, res) => {
  try {
    const recipeId = Number(req.params.recipeId);
    const body = req.body as RecipeBody;
    if (body.name !== undefined && !body.name.trim()) {
      res.status(400).json({ error: "name cannot be empty" });
      return;
    }
    const [updated] = await db
      .update(recipesTable)
      .set({
        name: body.name?.trim(),
        description: body.description,
        imageUrl: body.imageUrl,
        videoUrl: body.videoUrl,
        servingSize: body.servingSize,
        calories: body.calories,
        protein: body.protein,
        carbs: body.carbs,
        fats: body.fats,
        ingredients: body.ingredients,
        steps: body.steps,
        foodSwaps: body.foodSwaps,
        notes: body.notes,
        updatedAt: new Date(),
      })
      .where(eq(recipesTable.id, recipeId))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Recipe not found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/admin/recipes/:recipeId
router.delete("/admin/recipes/:recipeId", requireAdmin, async (req, res) => {
  try {
    const recipeId = Number(req.params.recipeId);
    const [deleted] = await db.delete(recipesTable).where(eq(recipesTable.id, recipeId)).returning();
    if (!deleted) {
      res.status(404).json({ error: "Recipe not found" });
      return;
    }
    res.json({ message: "Deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
