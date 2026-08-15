import { pgTable, serial, text, integer, boolean, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { appUsersTable } from "./appUsers";

// One row per user — upserted via POST /wellness/profile. `mode` is validated
// at the route layer (cycle | pregnant | postpartum | ttc), not enforced here,
// matching how other free-text "enum" columns (e.g. assessments.status) work.
export const wellnessProfilesTable = pgTable("wellness_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => appUsersTable.id, { onDelete: "cascade" }),
  mode: text("mode").notNull().default("cycle"),
  cycleLength: integer("cycle_length").notNull().default(28),
  periodLength: integer("period_length").notNull().default(5),
  lastPeriodStart: date("last_period_start"),
  dueDate: date("due_date"),
  pregnancyWeek: integer("pregnancy_week"),
  pregnancyDay: integer("pregnancy_day"),
  pregnancyLevel: text("pregnancy_level"),
  weeksPostpartum: integer("weeks_postpartum"),
  birthType: text("birth_type"),
  isBreastfeeding: boolean("is_breastfeeding").default(false),
  cycleReturned: boolean("cycle_returned").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertWellnessProfileSchema = createInsertSchema(wellnessProfilesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWellnessProfile = z.infer<typeof insertWellnessProfileSchema>;
export type WellnessProfile = typeof wellnessProfilesTable.$inferSelect;
