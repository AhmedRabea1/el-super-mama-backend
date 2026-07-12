import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { weeksTable } from "./weeks";

export const workoutDaysTable = pgTable("workout_days", {
  id: serial("id").primaryKey(),
  weekId: integer("week_id").notNull().references(() => weeksTable.id, { onDelete: "cascade" }),
  dayNumber: integer("day_number").notNull(),
  title: text("title").notNull(),
  dayType: text("day_type").notNull().default("training"),
  instructions: text("instructions"),
  notes: text("notes"),
  dayLabel: text("day_label"),
  duration: text("duration"),
  rpe: text("rpe"),
  equipment: text("equipment"),
  isGym: boolean("is_gym").notNull().default(false),
  workoutGoal: text("workout_goal"),
  coachNotes: text("coach_notes"),
  videoUrl: text("video_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertWorkoutDaySchema = createInsertSchema(workoutDaysTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWorkoutDay = z.infer<typeof insertWorkoutDaySchema>;
export type WorkoutDay = typeof workoutDaysTable.$inferSelect;
