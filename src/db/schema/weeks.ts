import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { phasesTable } from "./phases";

export const weeksTable = pgTable("weeks", {
  id: serial("id").primaryKey(),
  phaseId: integer("phase_id").notNull().references(() => phasesTable.id, { onDelete: "cascade" }),
  weekNumber: integer("week_number").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertWeekSchema = createInsertSchema(weeksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWeek = z.infer<typeof insertWeekSchema>;
export type Week = typeof weeksTable.$inferSelect;
