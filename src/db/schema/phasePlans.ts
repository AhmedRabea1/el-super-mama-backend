import { pgTable, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { phasesTable } from "./phases";
import { plansTable } from "./plans";

export const phasePlansTable = pgTable(
  "phase_plans",
  {
    id: serial("id").primaryKey(),
    phaseId: integer("phase_id").notNull().references(() => phasesTable.id, { onDelete: "cascade" }),
    planId: integer("plan_id").notNull().references(() => plansTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [unique().on(table.phaseId, table.planId)],
);

export const insertPhasePlanSchema = createInsertSchema(phasePlansTable).omit({ id: true, createdAt: true });
export type InsertPhasePlan = z.infer<typeof insertPhasePlanSchema>;
export type PhasePlan = typeof phasePlansTable.$inferSelect;
