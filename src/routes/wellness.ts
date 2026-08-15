import { Router } from "express";
import { db } from "../db";
import { wellnessProfilesTable, cycleLogsTable, dailyWellnessLogsTable } from "../db";
import { eq, and, desc } from "drizzle-orm";
import { requireUser } from "../middlewares/auth.js";

const router = Router();

const WELLNESS_MODES = new Set(["cycle", "pregnant", "postpartum", "ttc"]);

function today(): string {
  return new Date().toISOString().split("T")[0];
}

// GET /wellness/profile — the caller's profile, or null if never set.
router.get("/wellness/profile", requireUser, async (req, res) => {
  try {
    const userId = req.appUser!.userId;
    const [profile] = await db.select().from(wellnessProfilesTable).where(eq(wellnessProfilesTable.userId, userId)).limit(1);
    res.json(profile ?? null);
  } catch (err) {
    console.error("[GET /wellness/profile]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /wellness/profile — upsert. Every field is optional; only fields
// present in the body are written, everything else is left untouched (or
// defaults to the column default on first insert).
router.post("/wellness/profile", requireUser, async (req, res) => {
  try {
    const userId = req.appUser!.userId;
    const {
      mode, cycleLength, periodLength, lastPeriodStart, dueDate,
      pregnancyWeek, pregnancyDay, pregnancyLevel, weeksPostpartum, birthType,
      isBreastfeeding, cycleReturned,
    } = req.body as {
      mode?: string; cycleLength?: number; periodLength?: number;
      lastPeriodStart?: string; dueDate?: string;
      pregnancyWeek?: number; pregnancyDay?: number; pregnancyLevel?: string;
      weeksPostpartum?: number; birthType?: string;
      isBreastfeeding?: boolean; cycleReturned?: boolean;
    };

    if (mode !== undefined && !WELLNESS_MODES.has(mode)) {
      res.status(400).json({ error: `mode must be one of: ${[...WELLNESS_MODES].join(", ")}` });
      return;
    }

    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (mode !== undefined) values.mode = mode;
    if (cycleLength !== undefined) values.cycleLength = cycleLength;
    if (periodLength !== undefined) values.periodLength = periodLength;
    if (lastPeriodStart !== undefined) values.lastPeriodStart = lastPeriodStart;
    if (dueDate !== undefined) values.dueDate = dueDate;
    if (pregnancyWeek !== undefined) values.pregnancyWeek = pregnancyWeek;
    if (pregnancyDay !== undefined) values.pregnancyDay = pregnancyDay;
    if (pregnancyLevel !== undefined) values.pregnancyLevel = pregnancyLevel;
    if (weeksPostpartum !== undefined) values.weeksPostpartum = weeksPostpartum;
    if (birthType !== undefined) values.birthType = birthType;
    if (isBreastfeeding !== undefined) values.isBreastfeeding = isBreastfeeding;
    if (cycleReturned !== undefined) values.cycleReturned = cycleReturned;

    const [profile] = await db
      .insert(wellnessProfilesTable)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: wellnessProfilesTable.userId, set: values })
      .returning();

    res.json(profile);
  } catch (err) {
    console.error("[POST /wellness/profile]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /wellness/cycles — full period history, newest first.
router.get("/wellness/cycles", requireUser, async (req, res) => {
  try {
    const userId = req.appUser!.userId;
    const cycles = await db
      .select()
      .from(cycleLogsTable)
      .where(eq(cycleLogsTable.userId, userId))
      .orderBy(desc(cycleLogsTable.periodStart));
    res.json(cycles);
  } catch (err) {
    console.error("[GET /wellness/cycles]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /wellness/cycles — append-only: always creates a new history row.
// Also updates the profile's lastPeriodStart as a side effect.
router.post("/wellness/cycles", requireUser, async (req, res) => {
  try {
    const userId = req.appUser!.userId;
    const { periodStart, periodEnd, symptoms, notes } = req.body as {
      periodStart?: string; periodEnd?: string; symptoms?: string[]; notes?: string;
    };
    if (!periodStart) {
      res.status(400).json({ error: "periodStart is required" });
      return;
    }

    const [log] = await db
      .insert(cycleLogsTable)
      .values({ userId, periodStart, periodEnd, symptoms: symptoms ?? [], notes })
      .returning();

    await db
      .update(wellnessProfilesTable)
      .set({ lastPeriodStart: periodStart, updatedAt: new Date() })
      .where(eq(wellnessProfilesTable.userId, userId));

    res.status(201).json(log);
  } catch (err) {
    console.error("[POST /wellness/cycles]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /wellness/checkin/today — today's checkin, or null.
router.get("/wellness/checkin/today", requireUser, async (req, res) => {
  try {
    const userId = req.appUser!.userId;
    const [log] = await db
      .select()
      .from(dailyWellnessLogsTable)
      .where(and(eq(dailyWellnessLogsTable.userId, userId), eq(dailyWellnessLogsTable.logDate, today())))
      .limit(1);
    res.json(log ?? null);
  } catch (err) {
    console.error("[GET /wellness/checkin/today]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /wellness/checkin — full check-in history, newest first.
router.get("/wellness/checkin", requireUser, async (req, res) => {
  try {
    const userId = req.appUser!.userId;
    const logs = await db
      .select()
      .from(dailyWellnessLogsTable)
      .where(eq(dailyWellnessLogsTable.userId, userId))
      .orderBy(desc(dailyWellnessLogsTable.logDate));
    res.json(logs);
  } catch (err) {
    console.error("[GET /wellness/checkin]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /wellness/checkin — upsert on (userId, today): a second call the same
// day updates in place instead of creating a duplicate. Only fields present
// in the body are written, same partial-merge semantics as profile.
router.post("/wellness/checkin", requireUser, async (req, res) => {
  try {
    const userId = req.appUser!.userId;
    const { mood, energy, symptoms, cravings, notes } = req.body as {
      mood?: string; energy?: number; symptoms?: string[]; cravings?: string; notes?: string;
    };

    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (mood !== undefined) values.mood = mood;
    if (energy !== undefined) values.energy = energy;
    if (symptoms !== undefined) values.symptoms = symptoms;
    if (cravings !== undefined) values.cravings = cravings;
    if (notes !== undefined) values.notes = notes;

    const [log] = await db
      .insert(dailyWellnessLogsTable)
      .values({ userId, logDate: today(), ...values })
      .onConflictDoUpdate({
        target: [dailyWellnessLogsTable.userId, dailyWellnessLogsTable.logDate],
        set: values,
      })
      .returning();

    res.json(log);
  } catch (err) {
    console.error("[POST /wellness/checkin]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
