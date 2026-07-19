import { Router } from "express";
import { db } from "../db";
import {
  programsTable,
  phasesTable,
  weeksTable,
  workoutDaysTable,
  exercisesTable,
  phasePlansTable,
  plansTable,
  planMealsTable,
  recipesTable,
  dailyTargetsTable,
  foodTipsTable,
} from "../db";
import { eq, asc } from "drizzle-orm";

const router = Router();

async function getPlansForPhase(phaseId: number) {
  const rows = await db
    .select({
      id: plansTable.id,
      name: plansTable.name,
    })
    .from(phasePlansTable)
    .innerJoin(plansTable, eq(phasePlansTable.planId, plansTable.id))
    .where(eq(phasePlansTable.phaseId, phaseId))
    .orderBy(asc(plansTable.name));

  return Promise.all(
    rows.map(async (plan) => ({
      ...plan,
      meals: await db
        .select({
          id: planMealsTable.id,
          mealType: planMealsTable.mealType,
          recipe: recipesTable,
        })
        .from(planMealsTable)
        .leftJoin(recipesTable, eq(planMealsTable.recipeId, recipesTable.id))
        .where(eq(planMealsTable.planId, plan.id))
        .orderBy(asc(planMealsTable.id)),
    })),
  );
}

async function getPhaseContent(phaseId: number) {
  const weeks = await db
    .select()
    .from(weeksTable)
    .where(eq(weeksTable.phaseId, phaseId))
    .orderBy(asc(weeksTable.weekNumber));

  const weeksWithDays = await Promise.all(
    weeks.map(async (week) => {
      const days = await db
        .select()
        .from(workoutDaysTable)
        .where(eq(workoutDaysTable.weekId, week.id))
        .orderBy(asc(workoutDaysTable.dayNumber));

      const daysWithExercises = await Promise.all(
        days.map(async (day) => {
          const exercises = await db
            .select()
            .from(exercisesTable)
            .where(eq(exercisesTable.workoutDayId, day.id))
            .orderBy(asc(exercisesTable.orderIndex));
          return { ...day, exercises };
        }),
      );

      return { ...week, days: daysWithExercises };
    }),
  );

  const [dailyTargets] = await db
    .select()
    .from(dailyTargetsTable)
    .where(eq(dailyTargetsTable.phaseId, phaseId))
    .limit(1);

  const [foodTips] = await db
    .select()
    .from(foodTipsTable)
    .where(eq(foodTipsTable.phaseId, phaseId))
    .limit(1);

  const plans = await getPlansForPhase(phaseId);

  return {
    weeks: weeksWithDays,
    plans,
    dailyTargets: dailyTargets ?? null,
    foodTips: foodTips ?? null,
  };
}

// GET /programs — public catalog listing (hidden programs excluded)
// Optional ?category=prenatal|postpartum|nutrition filter.
router.get("/programs", async (req, res) => {
  try {
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    const rows = await db
      .select()
      .from(programsTable)
      .where(eq(programsTable.isHidden, false))
      .orderBy(asc(programsTable.createdAt));
    const programs = category ? rows.filter((p) => p.category === category) : rows;
    res.json({ programs });
  } catch (err) {
    console.error("[GET /programs]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /programs/:slug — full nested program detail: phases → weeks → days →
// exercises, plus each phase's nutrition plans/meals/recipes, daily targets,
// and food tips.
router.get("/programs/:slug", async (req, res) => {
  try {
    const [program] = await db
      .select()
      .from(programsTable)
      .where(eq(programsTable.slug, req.params.slug))
      .limit(1);
    if (!program) {
      res.status(404).json({ error: "Program not found" });
      return;
    }

    const phases = await db
      .select()
      .from(phasesTable)
      .where(eq(phasesTable.programId, program.id))
      .orderBy(asc(phasesTable.orderIndex));

    const phasesWithContent = await Promise.all(
      phases.map(async (phase) => ({ ...phase, ...(await getPhaseContent(phase.id)) })),
    );

    res.json({ ...program, phases: phasesWithContent });
  } catch (err) {
    console.error("[GET /programs/:slug]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
