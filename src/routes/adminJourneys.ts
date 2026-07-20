import { Router } from "express";
import { db } from "../db";
import { journeysTable, journeyProgramsTable, programsTable } from "../db";
import { eq, asc } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth.js";

const router = Router();

function cleanProgramIds(programIds: number[] | undefined): number[] {
  return Array.from(new Set((programIds ?? []).filter((id) => Number.isFinite(Number(id))).map(Number)));
}

async function getProgramsForJourney(journeyId: number) {
  return db
    .select({
      id: programsTable.id,
      slug: programsTable.slug,
      name: programsTable.name,
      description: programsTable.description,
      category: programsTable.category,
      isHidden: programsTable.isHidden,
      priceInEgp: programsTable.priceInEgp,
      priceInUsd: programsTable.priceInUsd,
      whatsIncluded: programsTable.whatsIncluded,
    })
    .from(journeyProgramsTable)
    .innerJoin(programsTable, eq(journeyProgramsTable.programId, programsTable.id))
    .where(eq(journeyProgramsTable.journeyId, journeyId))
    .orderBy(asc(journeyProgramsTable.orderIndex));
}

// GET /admin/journeys
router.get("/admin/journeys", requireAdmin, async (_req, res) => {
  try {
    const journeys = await db.select().from(journeysTable).orderBy(asc(journeysTable.createdAt));
    const withPrograms = await Promise.all(
      journeys.map(async (journey) => ({ ...journey, programs: await getProgramsForJourney(journey.id) })),
    );
    res.json({ journeys: withPrograms });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /admin/journeys
router.post("/admin/journeys", requireAdmin, async (req, res) => {
  try {
    const { name, description, priceInUsd, priceInEgp, programIds } = req.body as {
      name: string;
      description?: string;
      priceInUsd?: number;
      priceInEgp?: number;
      programIds?: number[];
    };
    const ids = cleanProgramIds(programIds);
    const journey = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(journeysTable)
        .values({ name, description, priceInUsd, priceInEgp })
        .returning();
      if (ids.length > 0) {
        await tx.insert(journeyProgramsTable).values(
          ids.map((programId, index) => ({ journeyId: created.id, programId, orderIndex: index })),
        );
      }
      return created;
    });
    res.status(201).json({ ...journey, programs: await getProgramsForJourney(journey.id) });
  } catch (err: any) {
    const pgCode = err?.code ?? err?.cause?.code;
    if (pgCode === "23503") {
      res.status(400).json({ error: "One or more programId values do not exist" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /admin/journeys/:journeyId
router.get("/admin/journeys/:journeyId", requireAdmin, async (req, res) => {
  try {
    const journeyId = Number(req.params.journeyId);
    const [journey] = await db.select().from(journeysTable).where(eq(journeysTable.id, journeyId)).limit(1);
    if (!journey) {
      res.status(404).json({ error: "Journey not found" });
      return;
    }
    res.json({ ...journey, programs: await getProgramsForJourney(journeyId) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /admin/journeys/:journeyId
router.patch("/admin/journeys/:journeyId", requireAdmin, async (req, res) => {
  try {
    const journeyId = Number(req.params.journeyId);
    const { name, description, priceInUsd, priceInEgp, programIds } = req.body as {
      name?: string;
      description?: string;
      priceInUsd?: number;
      priceInEgp?: number;
      programIds?: number[];
    };
    const updated = await db.transaction(async (tx) => {
      const [journey] = await tx
        .update(journeysTable)
        .set({ name, description, priceInUsd, priceInEgp, updatedAt: new Date() })
        .where(eq(journeysTable.id, journeyId))
        .returning();
      if (!journey) return null;
      if (programIds !== undefined) {
        const ids = cleanProgramIds(programIds);
        await tx.delete(journeyProgramsTable).where(eq(journeyProgramsTable.journeyId, journeyId));
        if (ids.length > 0) {
          await tx.insert(journeyProgramsTable).values(
            ids.map((programId, index) => ({ journeyId, programId, orderIndex: index })),
          );
        }
      }
      return journey;
    });
    if (!updated) {
      res.status(404).json({ error: "Journey not found" });
      return;
    }
    res.json({ ...updated, programs: await getProgramsForJourney(journeyId) });
  } catch (err: any) {
    const pgCode = err?.code ?? err?.cause?.code;
    if (pgCode === "23503") {
      res.status(400).json({ error: "One or more programId values do not exist" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /admin/journeys/:journeyId
router.delete("/admin/journeys/:journeyId", requireAdmin, async (req, res) => {
  try {
    const journeyId = Number(req.params.journeyId);
    await db.delete(journeysTable).where(eq(journeysTable.id, journeyId));
    res.json({ message: "Deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
