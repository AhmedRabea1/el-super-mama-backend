import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { plansTable } from "./plans";
import { recipesTable } from "./recipes";

export const planMealsTable = pgTable("plan_meals", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").notNull().references(() => plansTable.id, { onDelete: "cascade" }),
  mealType: text("meal_type").notNull(),
  recipeId: integer("recipe_id").notNull().references(() => recipesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPlanMealSchema = createInsertSchema(planMealsTable).omit({ id: true, createdAt: true });
export type InsertPlanMeal = z.infer<typeof insertPlanMealSchema>;
export type PlanMeal = typeof planMealsTable.$inferSelect;
