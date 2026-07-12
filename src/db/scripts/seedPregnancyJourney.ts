/**
 * Pregnancy Journey restructuring script
 *
 * Dev:  NODE_ENV=development tsx seedPregnancyJourney.ts
 * Prod: NODE_ENV=production  tsx seedPregnancyJourney.ts
 *
 * Restructures the "pregnancy_journey" program (slug: pregnancy_journey) so that,
 * instead of trimester-based standalone programs, it has four phases:
 *   Foundation (order 0) — unchanged, pre-existing 4-week onboarding phase
 *   Beginner   (order 1) — weeks 14 & 20 (placeholder content, weeks 14→delivery)
 *   Intermediate (order 2) — weeks 24 & 28
 *   Advanced   (order 3) — weeks 32 & 36
 *
 * Each new week has one training workout day with 3 placeholder exercises.
 * The pregnancy week only selects which week's content to show within the level;
 * the level itself is assigned once via onboarding/Foundation assessment and is
 * never chosen manually by the user (see lib/programRecommendation.ts in the
 * linah-fitness app, and GET /programs/pregnancy-journey/week in api-server).
 *
 * This script is idempotent: re-running it will not create duplicate phases,
 * weeks, or exercises if they already exist.
 */
import { db, DB_SCHEMA } from "../index.js";
import {
  programsTable,
  phasesTable,
  weeksTable,
  workoutDaysTable,
  exercisesTable,
} from "../schema/index.js";
import { eq, and } from "drizzle-orm";

const PROGRAM_SLUG = "pregnancy_journey";

type LevelSeed = {
  phaseName: "Beginner" | "Intermediate" | "Advanced";
  orderIndex: number;
  weeks: { weekNumber: number; title: string; exercises: string[] }[];
};

const LEVELS: LevelSeed[] = [
  {
    phaseName: "Beginner",
    orderIndex: 1,
    weeks: [
      {
        weekNumber: 14,
        title: "Week 14 — Beginner Foundation Movement",
        exercises: ["Glute Bridge", "Bird Dog", "Cat-Cow Stretch"],
      },
      {
        weekNumber: 20,
        title: "Week 20 — Beginner Strength Basics",
        exercises: ["Bodyweight Squat", "Wall Push-Up", "Seated Row (Band)"],
      },
    ],
  },
  {
    phaseName: "Intermediate",
    orderIndex: 2,
    weeks: [
      {
        weekNumber: 24,
        title: "Week 24 — Intermediate Full Body",
        exercises: ["Goblet Squat", "Standing Row (Band)", "Side-Lying Leg Raise"],
      },
      {
        weekNumber: 28,
        title: "Week 28 — Intermediate Strength Circuit",
        exercises: ["Sumo Squat", "Incline Push-Up", "Bent-Over Row (Light DB)"],
      },
    ],
  },
  {
    phaseName: "Advanced",
    orderIndex: 3,
    weeks: [
      {
        weekNumber: 32,
        title: "Week 32 — Advanced Conditioning",
        exercises: ["Step-Up", "Standing Chest Press (Band)", "Bird Dog with Reach"],
      },
      {
        weekNumber: 36,
        title: "Week 36 — Advanced Labor Prep",
        exercises: ["Deep Squat Hold", "Cat-Cow Flow", "Pelvic Tilt"],
      },
    ],
  },
];

async function seed() {
  console.log(`Restructuring Pregnancy Journey in ${DB_SCHEMA} schema...`);

  // Match by slug OR by the display name (case-insensitive), so a duplicate row with a
  // slightly different slug (e.g. a manually-created test copy) is still caught.
  const candidates = await db.select().from(programsTable);
  const matches = candidates.filter(
    (p) =>
      p.slug === PROGRAM_SLUG ||
      p.name.trim().toLowerCase() === "pregnancy journey"
  );

  if (matches.length === 0) {
    throw new Error(
      `No program with slug "${PROGRAM_SLUG}" (or name "Pregnancy Journey") found in ${DB_SCHEMA} schema — cannot seed levels.`
    );
  }

  // Keep the lowest-id match as canonical and delete any duplicates (their phases/weeks/
  // days/exercises cascade-delete via FK ON DELETE CASCADE). This is what removes stray
  // duplicate program rows (e.g. a legacy duplicate id=7) regardless of exact slug.
  matches.sort((a, b) => a.id - b.id);
  const program = matches[0];
  for (const dup of matches.slice(1)) {
    console.log(`Removing duplicate program row id=${dup.id} (name="${dup.name}", slug="${dup.slug}")`);
    await db.delete(programsTable).where(eq(programsTable.id, dup.id));
  }

  // Retire any legacy trimester-named phase left over under the canonical program (the
  // Pregnancy Journey now only has Foundation/Beginner/Intermediate/Advanced phases).
  const existingPhases = await db
    .select()
    .from(phasesTable)
    .where(eq(phasesTable.programId, program.id));
  const validPhaseNames = new Set(["Foundation", ...LEVELS.map((l) => l.phaseName)]);
  for (const phase of existingPhases) {
    if (!validPhaseNames.has(phase.name)) {
      console.log(`Removing legacy phase "${phase.name}" (id=${phase.id}) — replaced by level-based phases`);
      await db.delete(phasesTable).where(eq(phasesTable.id, phase.id));
    }
  }

  for (const level of LEVELS) {
    let [phase] = await db
      .select()
      .from(phasesTable)
      .where(and(eq(phasesTable.programId, program.id), eq(phasesTable.name, level.phaseName)))
      .limit(1);

    if (!phase) {
      [phase] = await db
        .insert(phasesTable)
        .values({
          programId: program.id,
          name: level.phaseName,
          orderIndex: level.orderIndex,
        })
        .returning();
      console.log(`Created phase "${level.phaseName}" (id=${phase.id})`);
    }

    for (const weekSeed of level.weeks) {
      let [week] = await db
        .select()
        .from(weeksTable)
        .where(and(eq(weeksTable.phaseId, phase.id), eq(weeksTable.weekNumber, weekSeed.weekNumber)))
        .limit(1);

      if (!week) {
        [week] = await db
          .insert(weeksTable)
          .values({
            phaseId: phase.id,
            weekNumber: weekSeed.weekNumber,
            title: weekSeed.title,
          })
          .returning();
        console.log(`  Created week ${weekSeed.weekNumber} (id=${week.id})`);
      }

      let [day] = await db
        .select()
        .from(workoutDaysTable)
        .where(and(eq(workoutDaysTable.weekId, week.id), eq(workoutDaysTable.dayNumber, 1)))
        .limit(1);

      if (!day) {
        [day] = await db
          .insert(workoutDaysTable)
          .values({
            weekId: week.id,
            dayNumber: 1,
            title: weekSeed.title.replace(/^Week \d+ — /, ""),
            dayType: "training",
          })
          .returning();
        console.log(`    Created workout day (id=${day.id})`);
      }

      const existingExercises = await db
        .select()
        .from(exercisesTable)
        .where(eq(exercisesTable.workoutDayId, day.id));

      if (existingExercises.length === 0) {
        for (let i = 0; i < weekSeed.exercises.length; i++) {
          await db.insert(exercisesTable).values({
            workoutDayId: day.id,
            name: weekSeed.exercises[i],
            sets: "3",
            reps: "10",
            rest: "60s",
            section: "main",
            orderIndex: i,
          });
        }
        console.log(`    Added ${weekSeed.exercises.length} placeholder exercises`);
      }
    }
  }

  console.log("Done.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
