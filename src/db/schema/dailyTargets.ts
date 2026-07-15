import { pgTable, serial, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { phasesTable } from "./phases";

export const dailyTargetsTable = pgTable("daily_targets", {
  id: serial("id").primaryKey(),
  phaseId: integer("phase_id").notNull().unique().references(() => phasesTable.id, { onDelete: "cascade" }),
  dailyCalories: integer("daily_calories"),
  protein: integer("protein"),
  carbs: integer("carbs"),
  fats: integer("fats"),
  fibers: integer("fibers"),
  waterTarget: integer("water_target"),
  supplements: jsonb("supplements").$type<string[]>().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDailyTargetSchema = createInsertSchema(dailyTargetsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDailyTarget = z.infer<typeof insertDailyTargetSchema>;
export type DailyTarget = typeof dailyTargetsTable.$inferSelect;
