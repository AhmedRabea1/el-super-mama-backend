import { pgTable, serial, integer, text, date, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { appUsersTable } from "./appUsers";

// Append-only period history — one row per logged cycle via POST
// /wellness/cycles, never updated in place.
export const cycleLogsTable = pgTable("cycle_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => appUsersTable.id, { onDelete: "cascade" }),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end"),
  cycleLength: integer("cycle_length"),
  symptoms: jsonb("symptoms").$type<string[]>().default([]),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCycleLogSchema = createInsertSchema(cycleLogsTable).omit({ id: true, createdAt: true });
export type InsertCycleLog = z.infer<typeof insertCycleLogSchema>;
export type CycleLog = typeof cycleLogsTable.$inferSelect;
