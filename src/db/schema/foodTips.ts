import { pgTable, serial, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { phasesTable } from "./phases";

export const foodTipsTable = pgTable("food_tips", {
  id: serial("id").primaryKey(),
  phaseId: integer("phase_id").notNull().unique().references(() => phasesTable.id, { onDelete: "cascade" }),
  foodsToFocus: jsonb("foods_to_focus").$type<string[]>().default([]),
  foodsToLimit: jsonb("foods_to_limit").$type<string[]>().default([]),
  monthlyTips: jsonb("monthly_tips").$type<string[]>().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertFoodTipsSchema = createInsertSchema(foodTipsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFoodTips = z.infer<typeof insertFoodTipsSchema>;
export type FoodTips = typeof foodTipsTable.$inferSelect;
