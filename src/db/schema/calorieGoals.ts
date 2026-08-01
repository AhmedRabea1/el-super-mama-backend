import { pgTable, serial, integer, date, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { appUsersTable } from "./appUsers";

// One row per user per calendar date — a self-set daily calorie goal plus a
// running total of calories logged that day. Only used for users subscribed
// to a nutrition-category program; fitness-program users keep the
// onboarding-computed assessments.targetCalories instead.
export const calorieGoalsTable = pgTable(
  "calorie_goals",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => appUsersTable.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    goal: integer("goal"),
    loggedCalories: integer("logged_calories").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [unique().on(table.userId, table.date)],
);

export const insertCalorieGoalSchema = createInsertSchema(calorieGoalsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCalorieGoal = z.infer<typeof insertCalorieGoalSchema>;
export type CalorieGoal = typeof calorieGoalsTable.$inferSelect;
