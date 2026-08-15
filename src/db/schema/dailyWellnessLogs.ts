import { pgTable, serial, integer, text, date, timestamp, jsonb, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { appUsersTable } from "./appUsers";

// One row per user per calendar date — upserted via POST /wellness/checkin.
export const dailyWellnessLogsTable = pgTable(
  "daily_wellness_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => appUsersTable.id, { onDelete: "cascade" }),
    logDate: date("log_date").notNull(),
    mood: text("mood"),
    energy: integer("energy"),
    symptoms: jsonb("symptoms").$type<string[]>().default([]),
    cravings: text("cravings"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [unique().on(table.userId, table.logDate)],
);

export const insertDailyWellnessLogSchema = createInsertSchema(dailyWellnessLogsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDailyWellnessLog = z.infer<typeof insertDailyWellnessLogSchema>;
export type DailyWellnessLog = typeof dailyWellnessLogsTable.$inferSelect;
