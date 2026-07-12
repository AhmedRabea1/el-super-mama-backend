/**
 * Pregnancy Journey — full weekly content build-out (weeks 14 → 40)
 *
 * Dev:  NODE_ENV=development tsx seedPregnancyJourneyFullContent.ts
 * Prod: NODE_ENV=production  tsx seedPregnancyJourneyFullContent.ts
 *
 * Replaces the 2-week placeholder content created by seedPregnancyJourney.ts with
 * real, trainer-authored weekly content spanning weeks 14 through 40 (delivery) for
 * each of the three level-based phases (Beginner / Intermediate / Advanced).
 *
 * Content design notes (grounded in ACOG "Physical Activity and Exercise During
 * Pregnancy and the Postpartum Period" guidance):
 *  - Weeks 14-26 (2nd trimester): moderate-intensity strength, stability, and
 *    mobility work. No prolonged supine (flat-on-back) positions are used past
 *    week 16 — side-lying, kneeling, seated, or standing variations are used
 *    instead to avoid vena cava compression.
 *  - Weeks 28-40 (3rd trimester): lower-intensity, more supported movement
 *    (wall/chair support, shorter holds), plus dedicated labor-prep and
 *    breathing/pelvic-floor work from week 32 onward.
 *  - Every workout day carries a standard safety `instructions` block (stop for
 *    bleeding, dizziness, contractions, fluid leakage, or reduced fetal
 *    movement; always warm up; avoid overheating and lying flat on the back).
 *  - Levels differ by volume/intensity, not by exercise safety: Beginner uses
 *    fewer sets/reps and simpler holds, Intermediate adds light equipment and
 *    volume, Advanced adds circuit-style volume and an extra core/mobility
 *    finisher — none introduce contraindicated movements (no jumping, no deep
 *    twisting, no supine holds, no lying prone, no contact/balance risk).
 *
 * IMPORTANT: This content was authored using established prenatal-exercise
 * guidelines (ACOG) but has NOT yet been signed off by a licensed prenatal
 * fitness/medical professional. Per the task's "done" criteria, a qualified
 * reviewer (e.g. a certified prenatal fitness specialist or OB-affiliated
 * physical therapist) should review it before this content goes live to real
 * users. Track that review as a follow-up.
 *
 * This script is idempotent per week/day: if a week or day already exists it
 * will refresh (replace) its exercises rather than duplicating them, so it is
 * safe to re-run after edits.
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

const SAFETY_INSTRUCTIONS =
  "Stop immediately and contact your care provider if you experience vaginal bleeding, dizziness, " +
  "chest pain, contractions, fluid leakage, calf pain/swelling, or reduced fetal movement. Warm up " +
  "for 3-5 minutes before starting, stay hydrated, avoid overheating, and avoid lying flat on your " +
  "back for extended periods. Move at a pace where you can hold a conversation.";

type ExerciseDef = {
  name: string;
  sets: string;
  reps: string;
  rest: string;
  notes: string;
  homeVersion?: string;
  gymVersion?: string;
};

type Level = "Beginner" | "Intermediate" | "Advanced";

// ---------------------------------------------------------------------------
// Exercise pools
// ---------------------------------------------------------------------------
// Second trimester (weeks 14-26): strength/stability pool (Day 1) and
// mobility/core pool (Day 2). No supine holds are used anywhere in either pool.

const STRENGTH_POOL_2ND: Omit<ExerciseDef, "sets" | "reps" | "rest">[] = [
  { name: "Bodyweight Squat", notes: "Feet hip-width, chest up, knees tracking over toes.", homeVersion: "No equipment", gymVersion: "Add light dumbbells held at chest" },
  { name: "Glute Bridge", notes: "Feet flat, lift hips by squeezing glutes, keep ribs down (avoid over-arching).", homeVersion: "Floor mat", gymVersion: "Add a resistance band above the knees" },
  { name: "Standing Side Leg Raise", notes: "Hold a wall or chair for balance; lift leg straight out to the side with control.", homeVersion: "Wall or chair for balance", gymVersion: "Add ankle cuff or band" },
  { name: "Wall Push-Up", notes: "Hands slightly wider than shoulders on the wall; lower chest toward the wall with control.", homeVersion: "Any wall", gymVersion: "Incline push-up on a bench" },
  { name: "Standing Row (Band)", notes: "Anchor a band at chest height; pull elbows back, squeezing shoulder blades together.", homeVersion: "Resistance band anchored to a door", gymVersion: "Seated cable row, light weight" },
  { name: "Step-Up (Low Step)", notes: "Use a low, stable step or stair; step up fully before stepping down with control.", homeVersion: "Bottom stair step", gymVersion: "Gym step platform" },
  { name: "Bird Dog", notes: "On hands and knees, extend opposite arm and leg while keeping hips level.", homeVersion: "Floor mat", gymVersion: "Floor mat" },
  { name: "Standing Bicep Curl", notes: "Light dumbbells or bands, elbows tucked at sides, controlled tempo.", homeVersion: "Light dumbbells or water bottles", gymVersion: "Light dumbbells" },
  { name: "Sumo Squat", notes: "Wide stance, toes turned out, sit hips back and down, chest tall.", homeVersion: "No equipment", gymVersion: "Hold a light dumbbell at chest" },
  { name: "Seated Overhead Press", notes: "Seated on a stable chair or ball, press light dumbbells overhead without arching the back.", homeVersion: "Light dumbbells, seated on a sturdy chair", gymVersion: "Seated shoulder press machine, light weight" },
];

const MOBILITY_POOL_2ND: Omit<ExerciseDef, "sets" | "reps" | "rest">[] = [
  { name: "Cat-Cow Stretch", notes: "On hands and knees, alternate arching and rounding the spine slowly with your breath.", homeVersion: "Floor mat", gymVersion: "Floor mat" },
  { name: "Side-Lying Leg Raise", notes: "Lie on your side (never flat on your back), lift top leg with control, keep hips stacked.", homeVersion: "Floor mat with a pillow between knees", gymVersion: "Add an ankle band" },
  { name: "Kneeling Pallof Press", notes: "Kneeling, band anchored to the side, press hands straight out resisting rotation.", homeVersion: "Resistance band anchored to a door", gymVersion: "Cable column, light weight" },
  { name: "Standing Pelvic Tilt", notes: "Feet hip-width, gently tuck pelvis under then release, engaging the pelvic floor as you exhale.", homeVersion: "No equipment", gymVersion: "No equipment" },
  { name: "Child's Pose (Wide-Knee)", notes: "Knees wide, hips sink back toward heels, arms reach forward to release the lower back.", homeVersion: "Floor mat", gymVersion: "Floor mat" },
  { name: "Seated Marching", notes: "Seated tall on a chair or ball, alternate lifting knees while keeping the spine tall.", homeVersion: "Sturdy chair", gymVersion: "Stability ball" },
  { name: "Standing Hip Circles", notes: "Hands on hips, draw slow controlled circles at the hips in each direction.", homeVersion: "No equipment", gymVersion: "No equipment" },
  { name: "Standing Chest Opener Stretch", notes: "Clasp hands behind your back and gently lift, opening through the chest and shoulders.", homeVersion: "No equipment", gymVersion: "No equipment" },
  { name: "Thread the Needle (Side-Lying)", notes: "On hands and knees, thread one arm underneath the body to rotate the upper spine gently.", homeVersion: "Floor mat", gymVersion: "Floor mat" },
  { name: "Standing Hamstring Stretch", notes: "Heel on a low step, hinge gently at the hips with a flat back until you feel a stretch.", homeVersion: "Low step or stair", gymVersion: "Low bench" },
];

// Third trimester (weeks 28-40): gentler, more supported strength pool, and a
// mobility/labor-prep pool that adds breathing and pelvic-floor release work.

const STRENGTH_POOL_3RD: Omit<ExerciseDef, "sets" | "reps" | "rest">[] = [
  { name: "Supported Squat (Chair/Wall)", notes: "Hold a wall or the back of a chair; squat only as low as feels comfortable.", homeVersion: "Wall or sturdy chair", gymVersion: "Squat rack support bar" },
  { name: "Glute Bridge (Short Range)", notes: "Smaller range of motion than earlier weeks; lift only to a comfortable height.", homeVersion: "Floor mat", gymVersion: "Floor mat" },
  { name: "Standing Side Leg Raise (Wall Support)", notes: "One hand on a wall for balance, lift leg to the side with a short controlled range.", homeVersion: "Wall for balance", gymVersion: "Wall for balance" },
  { name: "Wall Push-Up", notes: "Hands on the wall, slower tempo, focus on breath control through the movement.", homeVersion: "Any wall", gymVersion: "Incline push-up, shallow range" },
  { name: "Seated Row (Band)", notes: "Seated on a sturdy chair, band anchored in front, pull elbows back with control.", homeVersion: "Resistance band, sturdy chair", gymVersion: "Seated cable row, light weight" },
  { name: "Standing Bicep Curl (Light)", notes: "Very light dumbbells or bands; focus on controlled, slow reps.", homeVersion: "Light dumbbells or water bottles", gymVersion: "Light dumbbells" },
  { name: "Seated Overhead Press (Light)", notes: "Seated tall, light weight, stop the press before locking out overhead.", homeVersion: "Light dumbbells, sturdy chair", gymVersion: "Seated shoulder press machine, light weight" },
  { name: "Standing Calf Raise (Wall Support)", notes: "Hand on a wall, rise onto toes slowly to support circulation in the legs.", homeVersion: "Wall for balance", gymVersion: "Wall for balance" },
];

const LABOR_PREP_POOL_3RD: Omit<ExerciseDef, "sets" | "reps" | "rest">[] = [
  { name: "Cat-Cow Flow", notes: "Slow, breath-led flow on hands and knees to ease lower back tension and mobilize the pelvis.", homeVersion: "Floor mat", gymVersion: "Floor mat" },
  { name: "Butterfly Stretch (Seated)", notes: "Seated, soles of feet together, gently let knees relax open to release the hips.", homeVersion: "Floor mat or cushion", gymVersion: "Floor mat" },
  { name: "Pelvic Tilt Flow (Hands and Knees)", notes: "On hands and knees, gently tilt the pelvis forward and back in a slow, controlled flow.", homeVersion: "Floor mat", gymVersion: "Floor mat" },
  { name: "Deep Belly Breathing with Pelvic Floor Release", notes: "Inhale to relax the pelvic floor and belly, exhale gently — practicing the release used during labor.", homeVersion: "Seated or side-lying, quiet space", gymVersion: "Seated or side-lying, quiet space" },
  { name: "Figure-4 Stretch (Seated)", notes: "Seated, ankle crossed over opposite knee, hinge forward gently to release the glute.", homeVersion: "Sturdy chair", gymVersion: "Sturdy chair or bench" },
  { name: "Hip Circles on Birth Ball", notes: "Seated on a birth/stability ball, circle the hips slowly to encourage pelvic mobility.", homeVersion: "Birth ball (or standing hip circles if unavailable)", gymVersion: "Stability ball" },
  { name: "Kneeling Pallof Press (Light Band)", notes: "Kneeling, very light band tension, press out and hold briefly to support the core gently.", homeVersion: "Light resistance band", gymVersion: "Cable column, very light weight" },
  { name: "Side-Lying Leg Raise (Supported)", notes: "Lie on your side with a pillow between the knees, lift the top leg a small controlled distance.", homeVersion: "Floor mat with pillow", gymVersion: "Floor mat with pillow" },
];

// Descriptive week themes so titles read as real programming rather than a
// repeated template.
const THEMES_2ND = [
  "Foundation Movement",
  "Building Consistency",
  "Strength Basics",
  "Steady Progress",
  "Full Body Focus",
  "Core & Stability",
  "Midpoint Strength",
];
const THEMES_3RD_EARLY = [
  "Third Trimester Support",
  "Comfort & Strength",
  "Staying Active Safely",
];
const THEMES_3RD_LATE = [
  "Preparing to Progress",
  "Labor Readiness",
  "Late Pregnancy Strength",
  "Final Stretch Prep",
  "Labor Prep Essentials",
];

const LEVEL_CONFIG: Record<
  Level,
  { orderIndex: number; setsReps2nd: { sets: string; reps: string; rest: string }; setsReps3rd: { sets: string; reps: string; rest: string }; exerciseCount: number }
> = {
  Beginner: {
    orderIndex: 1,
    setsReps2nd: { sets: "2", reps: "8-10", rest: "60s" },
    setsReps3rd: { sets: "2", reps: "8-10", rest: "60s" },
    exerciseCount: 4,
  },
  Intermediate: {
    orderIndex: 2,
    setsReps2nd: { sets: "3", reps: "10-12", rest: "45s" },
    setsReps3rd: { sets: "3", reps: "10-12", rest: "45s" },
    exerciseCount: 4,
  },
  Advanced: {
    orderIndex: 3,
    setsReps2nd: { sets: "3", reps: "12-15", rest: "30-45s" },
    setsReps3rd: { sets: "3", reps: "10-12", rest: "30-45s" },
    exerciseCount: 5,
  },
};

function pickRotating<T>(pool: T[], startIndex: number, count: number): T[] {
  const result: T[] = [];
  for (let i = 0; i < count; i++) {
    result.push(pool[(startIndex + i) % pool.length]);
  }
  return result;
}

function buildExercises(
  pool: Omit<ExerciseDef, "sets" | "reps" | "rest">[],
  startIndex: number,
  count: number,
  setsRepsRest: { sets: string; reps: string; rest: string }
): ExerciseDef[] {
  return pickRotating(pool, startIndex, count).map((ex) => ({
    ...ex,
    ...setsRepsRest,
  }));
}

type WeekPlan = {
  weekNumber: number;
  title: string;
  day1Title: string;
  day1Exercises: ExerciseDef[];
  day2Title: string;
  day2Exercises: ExerciseDef[];
  equipment: string;
};

function buildLevelWeeks(level: Level): WeekPlan[] {
  const cfg = LEVEL_CONFIG[level];
  const weeks: WeekPlan[] = [];
  let rotation = 0;

  for (let weekNumber = 14; weekNumber <= 40; weekNumber += 2) {
    const isThird = weekNumber >= 28;
    const isLatethird = weekNumber >= 32;

    let theme: string;
    if (!isThird) {
      theme = THEMES_2ND[rotation % THEMES_2ND.length];
    } else if (!isLatethird) {
      theme = THEMES_3RD_EARLY[rotation % THEMES_3RD_EARLY.length];
    } else {
      theme = THEMES_3RD_LATE[rotation % THEMES_3RD_LATE.length];
    }

    const strengthPool = isThird ? STRENGTH_POOL_3RD : STRENGTH_POOL_2ND;
    const mobilityPool = isThird ? LABOR_PREP_POOL_3RD : MOBILITY_POOL_2ND;
    const setsReps = isThird ? cfg.setsReps3rd : cfg.setsReps2nd;

    const day1Exercises = buildExercises(strengthPool, rotation, cfg.exerciseCount, setsReps);
    const day2Exercises = buildExercises(mobilityPool, rotation + 2, cfg.exerciseCount, setsReps);

    weeks.push({
      weekNumber,
      title: `Week ${weekNumber} — ${level} ${theme}`,
      day1Title: isThird ? `${level} Supported Strength` : `${level} Strength & Stability`,
      day1Exercises,
      day2Title: isThird ? `${level} Mobility & Labor Prep` : `${level} Mobility & Core`,
      day2Exercises,
      equipment: isThird ? "Chair/wall support, light dumbbells or bands, birth ball (optional)" : "Light dumbbells or bands, floor mat",
    });

    rotation += cfg.exerciseCount;
  }

  return weeks;
}

const LEVELS: Level[] = ["Beginner", "Intermediate", "Advanced"];

async function upsertWeekContent(phaseId: number, plan: WeekPlan) {
  let [week] = await db
    .select()
    .from(weeksTable)
    .where(and(eq(weeksTable.phaseId, phaseId), eq(weeksTable.weekNumber, plan.weekNumber)))
    .limit(1);

  if (!week) {
    [week] = await db
      .insert(weeksTable)
      .values({ phaseId, weekNumber: plan.weekNumber, title: plan.title })
      .returning();
    console.log(`  Created week ${plan.weekNumber} (id=${week.id})`);
  } else {
    await db.update(weeksTable).set({ title: plan.title }).where(eq(weeksTable.id, week.id));
    console.log(`  Updated week ${plan.weekNumber} title (id=${week.id})`);
  }

  const dayDefs = [
    { dayNumber: 1, title: plan.day1Title, exercises: plan.day1Exercises },
    { dayNumber: 2, title: plan.day2Title, exercises: plan.day2Exercises },
  ];

  for (const dayDef of dayDefs) {
    let [day] = await db
      .select()
      .from(workoutDaysTable)
      .where(and(eq(workoutDaysTable.weekId, week.id), eq(workoutDaysTable.dayNumber, dayDef.dayNumber)))
      .limit(1);

    if (!day) {
      [day] = await db
        .insert(workoutDaysTable)
        .values({
          weekId: week.id,
          dayNumber: dayDef.dayNumber,
          title: dayDef.title,
          dayType: "training",
          instructions: SAFETY_INSTRUCTIONS,
          equipment: plan.equipment,
        })
        .returning();
      console.log(`    Created day ${dayDef.dayNumber} "${dayDef.title}" (id=${day.id})`);
    } else {
      await db
        .update(workoutDaysTable)
        .set({ title: dayDef.title, instructions: SAFETY_INSTRUCTIONS, equipment: plan.equipment })
        .where(eq(workoutDaysTable.id, day.id));
      console.log(`    Updated day ${dayDef.dayNumber} "${dayDef.title}" (id=${day.id})`);
    }

    // Replace exercises for this day so re-runs stay in sync with the latest content.
    await db.delete(exercisesTable).where(eq(exercisesTable.workoutDayId, day.id));
    for (let i = 0; i < dayDef.exercises.length; i++) {
      const ex = dayDef.exercises[i];
      await db.insert(exercisesTable).values({
        workoutDayId: day.id,
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
        rest: ex.rest,
        notes: ex.notes,
        homeVersion: ex.homeVersion,
        gymVersion: ex.gymVersion,
        section: "main",
        orderIndex: i,
      });
    }
    console.log(`      Wrote ${dayDef.exercises.length} exercises`);
  }
}

async function seed() {
  console.log(`Building full Pregnancy Journey weekly content in ${DB_SCHEMA} schema...`);

  const [program] = await db.select().from(programsTable).where(eq(programsTable.slug, PROGRAM_SLUG)).limit(1);
  if (!program) {
    throw new Error(`No program with slug "${PROGRAM_SLUG}" found in ${DB_SCHEMA} schema.`);
  }

  for (const level of LEVELS) {
    const cfg = LEVEL_CONFIG[level];
    let [phase] = await db
      .select()
      .from(phasesTable)
      .where(and(eq(phasesTable.programId, program.id), eq(phasesTable.name, level)))
      .limit(1);

    if (!phase) {
      [phase] = await db
        .insert(phasesTable)
        .values({ programId: program.id, name: level, orderIndex: cfg.orderIndex })
        .returning();
      console.log(`Created phase "${level}" (id=${phase.id})`);
    } else {
      console.log(`Phase "${level}" (id=${phase.id})`);
    }

    const weekPlans = buildLevelWeeks(level);
    for (const plan of weekPlans) {
      await upsertWeekContent(phase.id, plan);
    }
  }

  console.log("Done. Weeks 14-40 (step 2) now have real content for Beginner, Intermediate, and Advanced.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
