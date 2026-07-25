import { pgTable, serial, integer, text, boolean, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { appUsersTable } from "./appUsers";

// One row per user — the onboarding assessment completed after registration
// (see PATCH /users/me/assessment). Every field is optional at the DB level
// since different onboarding branches (pregnant / postpartum / ttc / general)
// populate different subsets.
export const assessmentsTable = pgTable("assessments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => appUsersTable.id, { onDelete: "cascade" }),
  status: text("status"), // "pregnant" | "postpartum" | "ttc" | "general" | "neither"
  weeksPregnant: integer("weeks_pregnant"),
  pregnancyAnchorDate: timestamp("pregnancy_anchor_date"),
  monthsPostpartum: integer("months_postpartum"),
  isBreastfeeding: boolean("is_breastfeeding"),
  exerciseHistory: text("exercise_history"), // "beginner" | "occasional" | "regular"
  activityLevel: text("activity_level"), // "sedentary" | "lightly_active" | "active"
  medicalClearance: text("medical_clearance"), // "yes" | "no" | "consult"
  fitnessLevel: text("fitness_level"), // "beginner" | "intermediate" | "advanced"
  trainingLocation: text("training_location"), // "home" | "gym" | "both"
  weight: numeric("weight", { precision: 5, scale: 2, mode: "number" }), // kg
  height: numeric("height", { precision: 5, scale: 2, mode: "number" }), // cm
  goal: text("goal"), // "weight_loss" | "postpartum" | "prenatal" | "general"
  targetCalories: integer("target_calories"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAssessmentSchema = createInsertSchema(assessmentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAssessment = z.infer<typeof insertAssessmentSchema>;
export type Assessment = typeof assessmentsTable.$inferSelect;
