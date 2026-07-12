import { pgTable, serial, integer, text, date, timestamp, jsonb } from "drizzle-orm/pg-core";

  export const dailyWellnessLogsTable = pgTable("daily_wellness_logs", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    logDate: date("log_date").notNull(),
    mood: text("mood"),
    energy: integer("energy"),
    symptoms: jsonb("symptoms").$type<string[]>().default([]),
    cravings: text("cravings"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  });

  export type DailyWellnessLog = typeof dailyWellnessLogsTable.$inferSelect;
  export type InsertDailyWellnessLog = typeof dailyWellnessLogsTable.$inferInsert;
  