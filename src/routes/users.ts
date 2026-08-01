import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db";
import { appUsersTable, assessmentsTable, calorieGoalsTable, phasesTable, programsTable, subscriptionsTable } from "../db";
import { eq, and, sql } from "drizzle-orm";
import { requireUser } from "../middlewares/auth.js";
import { formatUser } from "./appAuth.js";

const router = Router();

// Gate for the calorie goal/log endpoints: requires an active (paid) subscription
// and enrollment in a nutrition-category program. Fitness-program subscribers
// keep the existing onboarding-computed assessments.targetCalories instead.
async function requireNutritionSubscriber(req: Request, res: Response, next: NextFunction): Promise<void> {
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
    if (!user.programId) {
      res.status(403).json({ error: "Not enrolled in a nutrition program" });
      return;
    }
    const [program] = await db.select().from(programsTable).where(eq(programsTable.id, user.programId)).limit(1);
    if (!program || program.category?.toLowerCase() !== "nutrition") {
      res.status(403).json({ error: "Calorie tracking is only available for nutrition-program subscribers" });
      return;
    }
    next();
  } catch (err) {
    console.error("[requireNutritionSubscriber]", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

function formatCalorieGoal(row: typeof calorieGoalsTable.$inferSelect) {
  return { userId: row.userId, date: row.date, goal: row.goal, loggedCalories: row.loggedCalories };
}

export function formatAssessment(a: typeof assessmentsTable.$inferSelect | undefined) {
  if (!a) {
    return {
      status: null,
      weeksPregnant: null,
      pregnancyAnchorDate: null,
      monthsPostpartum: null,
      isBreastfeeding: null,
      exerciseHistory: null,
      activityLevel: null,
      medicalClearance: null,
      fitnessLevel: null,
      trainingLocation: null,
      weight: null,
      height: null,
      goal: null,
      targetCalories: null,
    };
  }
  return {
    status: a.status,
    weeksPregnant: a.weeksPregnant,
    pregnancyAnchorDate: a.pregnancyAnchorDate,
    monthsPostpartum: a.monthsPostpartum,
    isBreastfeeding: a.isBreastfeeding,
    exerciseHistory: a.exerciseHistory,
    activityLevel: a.activityLevel,
    medicalClearance: a.medicalClearance,
    fitnessLevel: a.fitnessLevel,
    trainingLocation: a.trainingLocation,
    weight: a.weight,
    height: a.height,
    goal: a.goal,
    targetCalories: a.targetCalories,
  };
}

// PATCH /users/me/assessment — upsert the caller's onboarding assessment.
// Every field is optional; only fields present in the body are written,
// everything else is left untouched (or defaults to null on first insert).
router.patch("/users/me/assessment", requireUser, async (req, res) => {
  try {
    const userId = req.appUser!.userId;
    const {
      status,
      weeksPregnant,
      pregnancyAnchorDate,
      monthsPostpartum,
      isBreastfeeding,
      exerciseHistory,
      activityLevel,
      medicalClearance,
      fitnessLevel,
      trainingLocation,
      weight,
      height,
      goal,
      targetCalories,
    } = req.body as {
      status?: string;
      weeksPregnant?: number;
      pregnancyAnchorDate?: string;
      monthsPostpartum?: number;
      isBreastfeeding?: boolean;
      exerciseHistory?: string;
      activityLevel?: string;
      medicalClearance?: string;
      fitnessLevel?: string;
      trainingLocation?: string;
      weight?: number;
      height?: number;
      goal?: string;
      targetCalories?: number;
    };

    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (status !== undefined) values.status = status;
    if (weeksPregnant !== undefined) values.weeksPregnant = weeksPregnant;
    if (pregnancyAnchorDate !== undefined) values.pregnancyAnchorDate = new Date(pregnancyAnchorDate);
    if (monthsPostpartum !== undefined) values.monthsPostpartum = monthsPostpartum;
    if (isBreastfeeding !== undefined) values.isBreastfeeding = isBreastfeeding;
    if (exerciseHistory !== undefined) values.exerciseHistory = exerciseHistory;
    if (activityLevel !== undefined) values.activityLevel = activityLevel;
    if (medicalClearance !== undefined) values.medicalClearance = medicalClearance;
    if (fitnessLevel !== undefined) values.fitnessLevel = fitnessLevel;
    if (trainingLocation !== undefined) values.trainingLocation = trainingLocation;
    if (weight !== undefined) values.weight = weight;
    if (height !== undefined) values.height = height;
    if (goal !== undefined) values.goal = goal;
    if (targetCalories !== undefined) values.targetCalories = targetCalories;

    const existing = await db
      .select()
      .from(assessmentsTable)
      .where(eq(assessmentsTable.userId, userId))
      .limit(1);

    let assessment;
    if (existing.length > 0) {
      [assessment] = await db
        .update(assessmentsTable)
        .set(values)
        .where(eq(assessmentsTable.userId, userId))
        .returning();
    } else {
      [assessment] = await db
        .insert(assessmentsTable)
        .values({ userId, ...values })
        .returning();
    }

    const [user] = await db.select().from(appUsersTable).where(eq(appUsersTable.id, userId)).limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ ...formatUser(user), ...formatAssessment(assessment) });
  } catch (err) {
    console.error("[PATCH /users/me/assessment]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /users/me/enrollment — enroll (or switch) the caller into a program,
// and/or assign which phase of that program they're on. Either field can be
// sent on its own: `{ phaseId }` alone moves the user between phases of their
// current program without resetting enrollment; `{ programId }` (with or
// without phaseId) always resets currentDay to 1, since enrolling/re-enrolling
// starts a fresh run. If programId changes and no phaseId is given, the old
// phaseId is cleared since it belonged to the previous program.
router.patch("/users/me/enrollment", requireUser, async (req, res) => {
  try {
    const userId = req.appUser!.userId;
    const { programId, phaseId } = req.body as { programId?: number; phaseId?: number | null };
    if (programId === undefined && phaseId === undefined) {
      res.status(400).json({ error: "programId or phaseId is required" });
      return;
    }

    const [existingUser] = await db.select().from(appUsersTable).where(eq(appUsersTable.id, userId)).limit(1);
    if (!existingUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    let program: typeof programsTable.$inferSelect | undefined;
    const values: Record<string, unknown> = { updatedAt: new Date() };

    if (programId !== undefined) {
      [program] = await db.select().from(programsTable).where(eq(programsTable.id, programId)).limit(1);
      if (!program) {
        res.status(400).json({ error: "Program not found" });
        return;
      }
      values.programId = programId;
      values.currentDay = 1;
      if (phaseId === undefined && programId !== existingUser.programId) {
        values.phaseId = null;
      }
    }

    if (phaseId !== undefined) {
      if (phaseId !== null) {
        const targetProgramId = programId ?? existingUser.programId;
        if (!targetProgramId) {
          res.status(400).json({ error: "User is not enrolled in a program" });
          return;
        }
        const [phase] = await db.select().from(phasesTable).where(eq(phasesTable.id, phaseId)).limit(1);
        if (!phase || phase.programId !== targetProgramId) {
          res.status(400).json({ error: "Phase not found for this program" });
          return;
        }
      }
      values.phaseId = phaseId;
    }

    const [updated] = await db
      .update(appUsersTable)
      .set(values)
      .where(eq(appUsersTable.id, userId))
      .returning();

    // Record the enrollment as a subscription row so it shows up alongside
    // RevenueCat-driven billing subscriptions (see routes/webhooks.ts).
    // Only fires on an actual program enrollment/switch, not a phase-only move.
    if (program) {
      await db.insert(subscriptionsTable).values({
        userId,
        productId: program.slug,
        status: "active",
        startsAt: new Date(),
        store: "internal",
      });
    }

    res.json(formatUser(updated));
  } catch (err) {
    console.error("[PATCH /users/me/enrollment]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /users/me/enrollment/advance-day — move the caller to the next day of
// their currently enrolled program (day 1 -> 2 -> 3 ...). Called when the app
// moves the user forward, e.g. after completing a day's content.
router.post("/users/me/enrollment/advance-day", requireUser, async (req, res) => {
  try {
    const userId = req.appUser!.userId;
    const [user] = await db.select().from(appUsersTable).where(eq(appUsersTable.id, userId)).limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (!user.programId) {
      res.status(400).json({ error: "User is not enrolled in a program" });
      return;
    }

    const [updated] = await db
      .update(appUsersTable)
      .set({ currentDay: user.currentDay + 1, updatedAt: new Date() })
      .where(eq(appUsersTable.id, userId))
      .returning();

    res.json(formatUser(updated));
  } catch (err) {
    console.error("[POST /users/me/enrollment/advance-day]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /users/me/calories — upsert today's (or any date's) calorie goal.
// Never touches loggedCalories, even if the row already exists.
router.patch("/users/me/calories", requireUser, requireNutritionSubscriber, async (req, res) => {
  try {
    const userId = req.appUser!.userId;
    const { date, goal } = req.body as { date?: string; goal?: number };
    if (!date || goal === undefined) {
      res.status(400).json({ error: "date and goal are required" });
      return;
    }

    const [row] = await db
      .insert(calorieGoalsTable)
      .values({ userId, date, goal })
      .onConflictDoUpdate({
        target: [calorieGoalsTable.userId, calorieGoalsTable.date],
        set: { goal, updatedAt: new Date() },
      })
      .returning();

    res.json(formatCalorieGoal(row));
  } catch (err) {
    console.error("[PATCH /users/me/calories]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /users/me/calories/log — atomically add `calories` to that date's
// running total. Upserts (goal stays null until the user sets one) so a user
// can log food before ever setting a goal.
router.post("/users/me/calories/log", requireUser, requireNutritionSubscriber, async (req, res) => {
  try {
    const userId = req.appUser!.userId;
    const { date, calories } = req.body as { date?: string; calories?: number };
    if (!date || calories === undefined) {
      res.status(400).json({ error: "date and calories are required" });
      return;
    }

    const [row] = await db
      .insert(calorieGoalsTable)
      .values({ userId, date, loggedCalories: calories })
      .onConflictDoUpdate({
        target: [calorieGoalsTable.userId, calorieGoalsTable.date],
        set: { loggedCalories: sql`${calorieGoalsTable.loggedCalories} + ${calories}`, updatedAt: new Date() },
      })
      .returning();

    res.json(formatCalorieGoal(row));
  } catch (err) {
    console.error("[POST /users/me/calories/log]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /users/me/calories?date=2026-08-01 — the goal/logged total for one date.
// 404s (with a null body) if nothing has been set or logged for that date yet.
router.get("/users/me/calories", requireUser, requireNutritionSubscriber, async (req, res) => {
  try {
    const userId = req.appUser!.userId;
    const date = req.query.date as string | undefined;
    if (!date) {
      res.status(400).json({ error: "date is required" });
      return;
    }

    const [row] = await db
      .select()
      .from(calorieGoalsTable)
      .where(and(eq(calorieGoalsTable.userId, userId), eq(calorieGoalsTable.date, date)))
      .limit(1);

    if (!row) {
      res.status(404).json(null);
      return;
    }
    res.json(formatCalorieGoal(row));
  } catch (err) {
    console.error("[GET /users/me/calories]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
