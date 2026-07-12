import { pgTable, serial, integer, text, date, timestamp, jsonb } from "drizzle-orm/pg-core";

  export const cycleLogsTable = pgTable("cycle_logs", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end"),
    cycleLength: integer("cycle_length"),
    symptoms: jsonb("symptoms").$type<string[]>().default([]),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  });

  export type CycleLog = typeof cycleLogsTable.$inferSelect;
  export type InsertCycleLog = typeof cycleLogsTable.$inferInsert;
  