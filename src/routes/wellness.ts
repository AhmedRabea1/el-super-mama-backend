import { Router } from "express";
  import jwt from "jsonwebtoken";
  import { db } from "../db";
  import { wellnessProfilesTable, cycleLogsTable, dailyWellnessLogsTable } from "../db";
  import { eq, and, desc } from "drizzle-orm";
  import { Request, Response, NextFunction } from "express";

  const JWT_SECRET = process.env.JWT_SECRET ?? "el-super-mama-secret-change-in-production";
  const router = Router();

  function requireUser(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const token = authHeader.slice(7);
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { userId: number; email: string };
      (req as any).userId = payload.userId;
      next();
    } catch {
      res.status(401).json({ error: "Invalid or expired token" });
    }
  }

  // GET /wellness/profile
  router.get("/wellness/profile", requireUser, async (req: any, res) => {
    try {
      const [profile] = await db
        .select()
        .from(wellnessProfilesTable)
        .where(eq(wellnessProfilesTable.userId, req.userId))
        .limit(1);
      if (!profile) {
        res.json(null);
        return;
      }
      res.json(profile);
    } catch (err) {
      console.error("[wellness/profile GET]", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /wellness/profile (upsert)
  router.post("/wellness/profile", requireUser, async (req: any, res) => {
    try {
      const { mode, cycleLength, periodLength, lastPeriodStart, dueDate,
              pregnancyWeek, pregnancyDay, pregnancyLevel, weeksPostpartum, birthType,
              isBreastfeeding, cycleReturned } = req.body;

      const existing = await db
        .select()
        .from(wellnessProfilesTable)
        .where(eq(wellnessProfilesTable.userId, req.userId))
        .limit(1);

      const values: any = { updatedAt: new Date() };
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

      let profile;
      if (existing.length > 0) {
        [profile] = await db
          .update(wellnessProfilesTable)
          .set(values)
          .where(eq(wellnessProfilesTable.userId, req.userId))
          .returning();
      } else {
        [profile] = await db
          .insert(wellnessProfilesTable)
          .values({ userId: req.userId, ...values })
          .returning();
      }
      res.json(profile);
    } catch (err) {
      console.error("[wellness/profile POST]", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /wellness/cycles
  router.get("/wellness/cycles", requireUser, async (req: any, res) => {
    try {
      const cycles = await db
        .select()
        .from(cycleLogsTable)
        .where(eq(cycleLogsTable.userId, req.userId))
        .orderBy(desc(cycleLogsTable.periodStart))
        .limit(12);
      res.json(cycles);
    } catch (err) {
      console.error("[wellness/cycles GET]", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /wellness/cycles
  router.post("/wellness/cycles", requireUser, async (req: any, res) => {
    try {
      const { periodStart, periodEnd, symptoms, notes } = req.body;
      if (!periodStart) {
        res.status(400).json({ error: "periodStart is required" });
        return;
      }
      const [log] = await db
        .insert(cycleLogsTable)
        .values({ userId: req.userId, periodStart, periodEnd, symptoms: symptoms ?? [], notes })
        .returning();

      // Update lastPeriodStart in wellness profile
      await db
        .update(wellnessProfilesTable)
        .set({ lastPeriodStart: periodStart, updatedAt: new Date() })
        .where(eq(wellnessProfilesTable.userId, req.userId));

      res.status(201).json(log);
    } catch (err) {
      console.error("[wellness/cycles POST]", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /wellness/checkin/today
  router.get("/wellness/checkin/today", requireUser, async (req: any, res) => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const [log] = await db
        .select()
        .from(dailyWellnessLogsTable)
        .where(
          and(
            eq(dailyWellnessLogsTable.userId, req.userId),
            eq(dailyWellnessLogsTable.logDate, today)
          )
        )
        .limit(1);
      res.json(log ?? null);
    } catch (err) {
      console.error("[wellness/checkin/today GET]", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /wellness/checkin
  router.post("/wellness/checkin", requireUser, async (req: any, res) => {
    try {
      const { mood, energy, symptoms, cravings, notes } = req.body;
      const today = new Date().toISOString().split("T")[0];

      const existing = await db
        .select()
        .from(dailyWellnessLogsTable)
        .where(
          and(
            eq(dailyWellnessLogsTable.userId, req.userId),
            eq(dailyWellnessLogsTable.logDate, today)
          )
        )
        .limit(1);

      let log;
      if (existing.length > 0) {
        [log] = await db
          .update(dailyWellnessLogsTable)
          .set({ mood, energy, symptoms: symptoms ?? [], cravings, notes, updatedAt: new Date() })
          .where(eq(dailyWellnessLogsTable.id, existing[0].id))
          .returning();
      } else {
        [log] = await db
          .insert(dailyWellnessLogsTable)
          .values({ userId: req.userId, logDate: today, mood, energy, symptoms: symptoms ?? [], cravings, notes })
          .returning();
      }
      res.json(log);
    } catch (err) {
      console.error("[wellness/checkin POST]", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  export default router;
  