import { pgTable, serial, integer, text, timestamp, boolean, date } from "drizzle-orm/pg-core";

  export const wellnessProfilesTable = pgTable("wellness_profiles", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().unique(),
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

  export type WellnessProfile = typeof wellnessProfilesTable.$inferSelect;
  export type InsertWellnessProfile = typeof wellnessProfilesTable.$inferInsert;
  