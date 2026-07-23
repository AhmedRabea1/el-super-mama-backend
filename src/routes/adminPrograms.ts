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
} from "../db";
import { eq, asc, desc } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth.js";

const router = Router();

async function getPlansForPhase(phaseId: number) {
  const rows = await db
    .select({
      id: plansTable.id,
      name: plansTable.name,
      createdAt: plansTable.createdAt,
      updatedAt: plansTable.updatedAt,
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
          recipeId: planMealsTable.recipeId,
          recipe: recipesTable,
        })
        .from(planMealsTable)
        .leftJoin(recipesTable, eq(planMealsTable.recipeId, recipesTable.id))
        .where(eq(planMealsTable.planId, plan.id))
        .orderBy(asc(planMealsTable.id)),
    })),
  );
}

function cleanPlanIds(planIds: number[] | undefined): number[] {
  return Array.from(new Set((planIds ?? []).filter((id) => Number.isFinite(Number(id))).map(Number)));
}

// ── Programs ────────────────────────────────────────────────────────────────

router.get("/admin/programs", requireAdmin, async (_req, res) => {
  try {
    const programs = await db
      .select()
      .from(programsTable)
      .orderBy(asc(programsTable.createdAt));
    res.json({ programs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/programs", requireAdmin, async (req, res) => {
  try {
    const { slug, name, description, category, subCategory, isHidden, priceInEgp, priceInUsd, whatsIncluded } = req.body as {
      slug: string;
      name: string;
      description?: string;
      category?: string;
      subCategory?: string;
      isHidden?: boolean;
      priceInEgp?: number;
      priceInUsd?: number;
      whatsIncluded?: string[];
    };
    const [program] = await db
      .insert(programsTable)
      .values({ slug, name, description, category, subCategory, isHidden: isHidden ?? false, priceInEgp, priceInUsd, whatsIncluded: whatsIncluded ?? [] })
      .returning();
    res.status(201).json(program);
  } catch (err: any) {
    const pgCode = err?.code ?? err?.cause?.code;
    if (pgCode === "23505") {
      res.status(409).json({ error: "Slug already exists — pick a unique slug" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/programs/:programId", requireAdmin, async (req, res) => {
  try {
    const programId = Number(req.params.programId);
    const [program] = await db
      .select()
      .from(programsTable)
      .where(eq(programsTable.id, programId))
      .limit(1);
    if (!program) {
      res.status(404).json({ error: "Program not found" });
      return;
    }
    const phases = await db
      .select()
      .from(phasesTable)
      .where(eq(phasesTable.programId, programId))
      .orderBy(asc(phasesTable.orderIndex));
    res.json({ ...program, phases });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/programs/:programId", requireAdmin, async (req, res) => {
  try {
    const programId = Number(req.params.programId);
    const { slug, name, description, category, subCategory, isHidden, priceInEgp, priceInUsd, whatsIncluded } = req.body as {
      slug?: string;
      name?: string;
      description?: string;
      category?: string;
      subCategory?: string;
      isHidden?: boolean;
      priceInEgp?: number;
      priceInUsd?: number;
      whatsIncluded?: string[];
    };
    const [updated] = await db
      .update(programsTable)
      .set({ slug, name, description, category, subCategory, isHidden, priceInEgp, priceInUsd, whatsIncluded, updatedAt: new Date() })
      .where(eq(programsTable.id, programId))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Program not found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/programs/:programId", requireAdmin, async (req, res) => {
  try {
    const programId = Number(req.params.programId);
    await db.delete(programsTable).where(eq(programsTable.id, programId));
    res.json({ message: "Deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Phases ──────────────────────────────────────────────────────────────────

router.get("/admin/programs/:programId/phases", requireAdmin, async (req, res) => {
  try {
    const programId = Number(req.params.programId);
    const phases = await db
      .select()
      .from(phasesTable)
      .where(eq(phasesTable.programId, programId))
      .orderBy(asc(phasesTable.orderIndex));
    res.json({ phases });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/programs/:programId/phases", requireAdmin, async (req, res) => {
  try {
    const programId = Number(req.params.programId);
    const { name, description, orderIndex, planIds } = req.body as {
      name: string;
      description?: string;
      orderIndex?: number;
      planIds?: number[];
    };
    const ids = cleanPlanIds(planIds);
    const phase = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(phasesTable)
        .values({ programId, name, description, orderIndex: orderIndex ?? 0 })
        .returning();
      if (ids.length > 0) {
        await tx.insert(phasePlansTable).values(ids.map((planId) => ({ phaseId: created.id, planId })));
      }
      return created;
    });
    res.status(201).json({ ...phase, plans: await getPlansForPhase(phase.id) });
  } catch (err: any) {
    const pgCode = err?.code ?? err?.cause?.code;
    if (pgCode === "23503") {
      res.status(400).json({ error: "One or more planId values do not exist" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/phases/:phaseId", requireAdmin, async (req, res) => {
  try {
    const phaseId = Number(req.params.phaseId);
    const [phase] = await db
      .select()
      .from(phasesTable)
      .where(eq(phasesTable.id, phaseId))
      .limit(1);
    if (!phase) {
      res.status(404).json({ error: "Phase not found" });
      return;
    }
    const weeks = await db
      .select()
      .from(weeksTable)
      .where(eq(weeksTable.phaseId, phaseId))
      .orderBy(asc(weeksTable.weekNumber));
    const plans = await getPlansForPhase(phaseId);
    res.json({ ...phase, weeks, plans });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/phases/:phaseId", requireAdmin, async (req, res) => {
  try {
    const phaseId = Number(req.params.phaseId);
    const { name, description, orderIndex, planIds } = req.body as {
      name?: string;
      description?: string;
      orderIndex?: number;
      planIds?: number[];
    };
    const updated = await db.transaction(async (tx) => {
      const [phase] = await tx
        .update(phasesTable)
        .set({ name, description, orderIndex, updatedAt: new Date() })
        .where(eq(phasesTable.id, phaseId))
        .returning();
      if (!phase) return null;
      if (planIds !== undefined) {
        const ids = cleanPlanIds(planIds);
        await tx.delete(phasePlansTable).where(eq(phasePlansTable.phaseId, phaseId));
        if (ids.length > 0) {
          await tx.insert(phasePlansTable).values(ids.map((planId) => ({ phaseId, planId })));
        }
      }
      return phase;
    });
    if (!updated) {
      res.status(404).json({ error: "Phase not found" });
      return;
    }
    res.json({ ...updated, plans: await getPlansForPhase(phaseId) });
  } catch (err: any) {
    const pgCode = err?.code ?? err?.cause?.code;
    if (pgCode === "23503") {
      res.status(400).json({ error: "One or more planId values do not exist" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/phases/:phaseId", requireAdmin, async (req, res) => {
  try {
    const phaseId = Number(req.params.phaseId);
    await db.delete(phasesTable).where(eq(phasesTable.id, phaseId));
    res.json({ message: "Deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Weeks ────────────────────────────────────────────────────────────────────

router.post("/admin/phases/:phaseId/weeks", requireAdmin, async (req, res) => {
  try {
    const phaseId = Number(req.params.phaseId);
    const { weekNumber, title, description } = req.body as {
      weekNumber: number;
      title: string;
      description?: string;
    };
    const [week] = await db
      .insert(weeksTable)
      .values({ phaseId, weekNumber, title, description })
      .returning();
    res.status(201).json(week);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/weeks/:weekId", requireAdmin, async (req, res) => {
  try {
    const weekId = Number(req.params.weekId);
    const [week] = await db
      .select()
      .from(weeksTable)
      .where(eq(weeksTable.id, weekId))
      .limit(1);
    if (!week) {
      res.status(404).json({ error: "Week not found" });
      return;
    }
    const days = await db
      .select()
      .from(workoutDaysTable)
      .where(eq(workoutDaysTable.weekId, weekId))
      .orderBy(asc(workoutDaysTable.dayNumber));
    res.json({ ...week, days });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/weeks/:weekId", requireAdmin, async (req, res) => {
  try {
    const weekId = Number(req.params.weekId);
    const { weekNumber, title, description } = req.body as {
      weekNumber?: number;
      title?: string;
      description?: string;
    };
    const [updated] = await db
      .update(weeksTable)
      .set({ weekNumber, title, description, updatedAt: new Date() })
      .where(eq(weeksTable.id, weekId))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Week not found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/weeks/:weekId", requireAdmin, async (req, res) => {
  try {
    const weekId = Number(req.params.weekId);
    await db.delete(weeksTable).where(eq(weeksTable.id, weekId));
    res.json({ message: "Deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Workout Days ─────────────────────────────────────────────────────────────

router.post("/admin/weeks/:weekId/days", requireAdmin, async (req, res) => {
  try {
    const weekId = Number(req.params.weekId);
    const {
      dayNumber, title, dayType, instructions, notes,
      dayLabel, duration, rpe, equipment, isGym, workoutGoal, coachNotes, videoUrl,
    } = req.body as {
      dayNumber: number; title: string; dayType?: string;
      instructions?: string; notes?: string; dayLabel?: string;
      duration?: string; rpe?: string; equipment?: string;
      isGym?: boolean; workoutGoal?: string; coachNotes?: string; videoUrl?: string;
    };
    const [day] = await db
      .insert(workoutDaysTable)
      .values({
        weekId, dayNumber, title, dayType: dayType ?? "training",
        instructions, notes, dayLabel, duration, rpe, equipment,
        isGym: isGym ?? false, workoutGoal, coachNotes, videoUrl,
      })
      .returning();
    res.status(201).json(day);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/days/:dayId", requireAdmin, async (req, res) => {
  try {
    const dayId = Number(req.params.dayId);
    const [day] = await db
      .select()
      .from(workoutDaysTable)
      .where(eq(workoutDaysTable.id, dayId))
      .limit(1);
    if (!day) {
      res.status(404).json({ error: "Day not found" });
      return;
    }
    const exercises = await db
      .select()
      .from(exercisesTable)
      .where(eq(exercisesTable.workoutDayId, dayId))
      .orderBy(asc(exercisesTable.orderIndex));
    res.json({ ...day, exercises });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/days/:dayId", requireAdmin, async (req, res) => {
  try {
    const dayId = Number(req.params.dayId);
    const {
      dayNumber, title, dayType, instructions, notes,
      dayLabel, duration, rpe, equipment, isGym, workoutGoal, coachNotes, videoUrl,
    } = req.body as {
      dayNumber?: number; title?: string; dayType?: string;
      instructions?: string; notes?: string; dayLabel?: string;
      duration?: string; rpe?: string; equipment?: string;
      isGym?: boolean; workoutGoal?: string; coachNotes?: string; videoUrl?: string;
    };
    const [updated] = await db
      .update(workoutDaysTable)
      .set({
        dayNumber, title, dayType, instructions, notes,
        dayLabel, duration, rpe, equipment, isGym, workoutGoal, coachNotes, videoUrl,
        updatedAt: new Date(),
      })
      .where(eq(workoutDaysTable.id, dayId))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Day not found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/days/:dayId", requireAdmin, async (req, res) => {
  try {
    const dayId = Number(req.params.dayId);
    await db.delete(workoutDaysTable).where(eq(workoutDaysTable.id, dayId));
    res.json({ message: "Deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Exercises ────────────────────────────────────────────────────────────────

router.put("/admin/days/:dayId/exercises/bulk", requireAdmin, async (req, res) => {
  try {
    const dayId = Number(req.params.dayId);
    const { exercises } = req.body as {
      exercises: Array<{
        name: string;
        sets?: string;
        reps?: string;
        rest?: string;
        notes?: string;
        videoUrl?: string;
      }>;
    };
    await db.delete(exercisesTable).where(eq(exercisesTable.workoutDayId, dayId));
    if (exercises.length > 0) {
      const rows = exercises
        .filter((ex) => ex.name?.trim())
        .map((ex: any, idx) => ({
          workoutDayId: dayId,
          name: ex.name.trim(),
          sets: ex.sets?.trim() || null,
          reps: ex.reps?.trim() || null,
          rest: ex.rest?.trim() || null,
          notes: ex.notes?.trim() || null,
          videoUrl: ex.videoUrl?.trim() || null,
          section: ex.section?.trim() || "main",
          orderIndex: idx,
        }));
      const inserted = await db.insert(exercisesTable).values(rows).returning();
      res.json({ exercises: inserted });
    } else {
      res.json({ exercises: [] });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/days/:dayId/exercises", requireAdmin, async (req, res) => {
  try {
    const dayId = Number(req.params.dayId);
    const {
      name,
      sets,
      reps,
      rest,
      notes,
      homeVersion,
      gymVersion,
      videoUrl,
      orderIndex,
    } = req.body as {
      name: string;
      sets?: string;
      reps?: string;
      rest?: string;
      notes?: string;
      homeVersion?: string;
      gymVersion?: string;
      videoUrl?: string;
      orderIndex?: number;
    };
    const [exercise] = await db
      .insert(exercisesTable)
      .values({
        workoutDayId: dayId,
        name,
        sets,
        reps,
        rest,
        notes,
        homeVersion,
        gymVersion,
        videoUrl,
        orderIndex: orderIndex ?? 0,
      })
      .returning();
    res.status(201).json(exercise);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/exercises/:exerciseId", requireAdmin, async (req, res) => {
  try {
    const exerciseId = Number(req.params.exerciseId);
    const {
      name,
      sets,
      reps,
      rest,
      notes,
      homeVersion,
      gymVersion,
      videoUrl,
      orderIndex,
    } = req.body as {
      name?: string;
      sets?: string;
      reps?: string;
      rest?: string;
      notes?: string;
      homeVersion?: string;
      gymVersion?: string;
      videoUrl?: string;
      orderIndex?: number;
    };
    const [updated] = await db
      .update(exercisesTable)
      .set({ name, sets, reps, rest, notes, homeVersion, gymVersion, videoUrl, orderIndex, updatedAt: new Date() })
      .where(eq(exercisesTable.id, exerciseId))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Exercise not found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Duplicate Day ─────────────────────────────────────────────────────────────

router.post("/admin/days/:dayId/duplicate", requireAdmin, async (req, res) => {
  try {
    const dayId = Number(req.params.dayId);
    const [day] = await db.select().from(workoutDaysTable).where(eq(workoutDaysTable.id, dayId)).limit(1);
    if (!day) { res.status(404).json({ error: "Day not found" }); return; }
    const exercises = await db.select().from(exercisesTable).where(eq(exercisesTable.workoutDayId, dayId)).orderBy(asc(exercisesTable.orderIndex));
    const siblings = await db.select().from(workoutDaysTable).where(eq(workoutDaysTable.weekId, day.weekId)).orderBy(desc(workoutDaysTable.dayNumber));
    const nextDayNumber = (siblings[0]?.dayNumber ?? 0) + 1;
    const [newDay] = await db.insert(workoutDaysTable).values({
      weekId: day.weekId, dayNumber: nextDayNumber, title: `${day.title} (Copy)`,
      dayType: day.dayType, instructions: day.instructions, notes: day.notes,
      dayLabel: day.dayLabel, duration: day.duration, rpe: day.rpe,
      equipment: day.equipment, isGym: day.isGym, workoutGoal: day.workoutGoal,
      coachNotes: day.coachNotes, videoUrl: day.videoUrl,
    }).returning();
    if (exercises.length > 0) {
      await db.insert(exercisesTable).values(exercises.map((ex) => ({
        workoutDayId: newDay.id, name: ex.name, sets: ex.sets, reps: ex.reps,
        rest: ex.rest, notes: ex.notes, videoUrl: ex.videoUrl,
        homeVersion: ex.homeVersion, gymVersion: ex.gymVersion,
        section: ex.section, orderIndex: ex.orderIndex,
      })));
    }
    res.status(201).json(newDay);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Duplicate Week ────────────────────────────────────────────────────────────

router.post("/admin/weeks/:weekId/duplicate", requireAdmin, async (req, res) => {
  try {
    const weekId = Number(req.params.weekId);
    const [week] = await db.select().from(weeksTable).where(eq(weeksTable.id, weekId)).limit(1);
    if (!week) { res.status(404).json({ error: "Week not found" }); return; }
    const days = await db.select().from(workoutDaysTable).where(eq(workoutDaysTable.weekId, weekId)).orderBy(asc(workoutDaysTable.dayNumber));
    const siblings = await db.select().from(weeksTable).where(eq(weeksTable.phaseId, week.phaseId)).orderBy(desc(weeksTable.weekNumber));
    const nextWeekNumber = (siblings[0]?.weekNumber ?? 0) + 1;
    const [newWeek] = await db.insert(weeksTable).values({
      phaseId: week.phaseId, weekNumber: nextWeekNumber,
      title: `${week.title} (Copy)`, description: week.description,
    }).returning();
    for (const day of days) {
      const exercises = await db.select().from(exercisesTable).where(eq(exercisesTable.workoutDayId, day.id)).orderBy(asc(exercisesTable.orderIndex));
      const [newDay] = await db.insert(workoutDaysTable).values({
        weekId: newWeek.id, dayNumber: day.dayNumber, title: day.title,
        dayType: day.dayType, instructions: day.instructions, notes: day.notes,
        dayLabel: day.dayLabel, duration: day.duration, rpe: day.rpe,
        equipment: day.equipment, isGym: day.isGym, workoutGoal: day.workoutGoal, coachNotes: day.coachNotes,
      }).returning();
      if (exercises.length > 0) {
        await db.insert(exercisesTable).values(exercises.map((ex) => ({
          workoutDayId: newDay.id, name: ex.name, sets: ex.sets, reps: ex.reps,
          rest: ex.rest, notes: ex.notes, videoUrl: ex.videoUrl,
          homeVersion: ex.homeVersion, gymVersion: ex.gymVersion,
          section: ex.section, orderIndex: ex.orderIndex,
        })));
      }
    }
    res.status(201).json(newWeek);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/exercises/:exerciseId", requireAdmin, async (req, res) => {
  try {
    const exerciseId = Number(req.params.exerciseId);
    await db.delete(exercisesTable).where(eq(exercisesTable.id, exerciseId));
    res.json({ message: "Deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
