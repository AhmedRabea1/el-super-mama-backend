import { pgTable, serial, text, boolean, numeric, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const programsTable = pgTable("programs", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"),
  isHidden: boolean("is_hidden").notNull().default(false),
  priceInEgp: numeric("price_in_egp", { precision: 10, scale: 2, mode: "number" }),
  priceInUsd: numeric("price_in_usd", { precision: 10, scale: 2, mode: "number" }),
  whatsIncluded: jsonb("whats_included").$type<string[]>().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProgramSchema = createInsertSchema(programsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProgram = z.infer<typeof insertProgramSchema>;
export type Program = typeof programsTable.$inferSelect;
