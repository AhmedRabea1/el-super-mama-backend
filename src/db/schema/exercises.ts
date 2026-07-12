import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workoutDaysTable } from "./workoutDays";

export const exercisesTable = pgTable("exercises", {
  id: serial("id").primaryKey(),
  workoutDayId: integer("workout_day_id").notNull().references(() => workoutDaysTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sets: text("sets"),
  reps: text("reps"),
  rest: text("rest"),
  notes: text("notes"),
  homeVersion: text("home_version"),
  gymVersion: text("gym_version"),
  videoUrl: text("video_url"),
  section: text("section").notNull().default("main"),
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertExerciseSchema = createInsertSchema(exercisesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertExercise = z.infer<typeof insertExerciseSchema>;
export type Exercise = typeof exercisesTable.$inferSelect;
