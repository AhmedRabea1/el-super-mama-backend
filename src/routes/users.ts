import { Router } from "express";
import { db } from "../db";
import { appUsersTable, assessmentsTable } from "../db";
import { eq } from "drizzle-orm";
import { requireUser } from "../middlewares/auth.js";
import { formatUser } from "./appAuth.js";

const router = Router();

function formatAssessment(a: typeof assessmentsTable.$inferSelect | undefined) {
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

// PATCH /users/me/enrollment — enroll (or switch) the caller into a program.
// Always resets currentDay to 1, since enrolling/re-enrolling starts a fresh run.
router.patch("/users/me/enrollment", requireUser, async (req, res) => {
  try {
    const userId = req.appUser!.userId;
    const { programId } = req.body as { programId?: number };
    if (programId === undefined) {
      res.status(400).json({ error: "programId is required" });
      return;
    }

    const [updated] = await db
      .update(appUsersTable)
      .set({ programId, currentDay: 1, updatedAt: new Date() })
      .where(eq(appUsersTable.id, userId))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json(formatUser(updated));
  } catch (err: any) {
    const pgCode = err?.code ?? err?.cause?.code;
    if (pgCode === "23503") {
      res.status(400).json({ error: "Program not found" });
      return;
    }
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

export default router;
