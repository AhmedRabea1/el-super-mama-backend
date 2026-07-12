import { Router } from "express";
import { db } from "../db";
import {
  programsTable,
  phasesTable,
  weeksTable,
  workoutDaysTable,
  exercisesTable,
} from "../db";
import { eq, asc, desc, and, lte } from "drizzle-orm";

const router = Router();

const LEVEL_PHASE_NAME: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

// GET /programs/pregnancy-journey/week?level=beginner&week=16
// Returns the closest available week (<= requested pregnancy week) of content
// for the given assigned level, so the app can auto-update the displayed
// week as the pregnancy progresses without the user ever picking a level.
router.get("/programs/pregnancy-journey/week", async (req, res) => {
  try {
    const level = String(req.query.level ?? "beginner").toLowerCase();
    const requestedWeek = Number(req.query.week ?? 14);
    const phaseName = LEVEL_PHASE_NAME[level];
    if (!phaseName) {
      res.status(400).json({ error: "level must be one of beginner, intermediate, advanced" });
      return;
    }

    const [program] = await db
      .select()
      .from(programsTable)
      .where(eq(programsTable.slug, "pregnancy_journey"))
      .limit(1);
    if (!program) {
      res.status(404).json({ error: "Pregnancy Journey program not found" });
      return;
    }

    const [phase] = await db
      .select()
      .from(phasesTable)
      .where(and(eq(phasesTable.programId, program.id), eq(phasesTable.name, phaseName)))
      .limit(1);
    if (!phase) {
      res.status(404).json({ error: `No ${phaseName} phase configured yet` });
      return;
    }

    // Find the closest week at or before the requested pregnancy week; if none
    // (e.g. user is earlier than the first authored week for this level),
    // fall back to the earliest week available for the level.
    const weeksAtOrBefore = await db
      .select()
      .from(weeksTable)
      .where(and(eq(weeksTable.phaseId, phase.id), lte(weeksTable.weekNumber, requestedWeek)))
      .orderBy(desc(weeksTable.weekNumber))
      .limit(1);

    let week = weeksAtOrBefore[0];
    if (!week) {
      const earliest = await db
        .select()
        .from(weeksTable)
        .where(eq(weeksTable.phaseId, phase.id))
        .orderBy(asc(weeksTable.weekNumber))
        .limit(1);
      week = earliest[0];
    }

    if (!week) {
      res.status(404).json({ error: `No weeks configured yet for ${phaseName}` });
      return;
    }

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
      })
    );

    res.json({
      level,
      phase: { id: phase.id, name: phase.name },
      week: { ...week, days: daysWithExercises },
    });
  } catch (err) {
    console.error("[pregnancy-journey/week GET]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
