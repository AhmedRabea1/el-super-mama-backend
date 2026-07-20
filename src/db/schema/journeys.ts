import { pgTable, serial, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const journeysTable = pgTable("journeys", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  priceInUsd: numeric("price_in_usd", { precision: 10, scale: 2, mode: "number" }),
  priceInEgp: numeric("price_in_egp", { precision: 10, scale: 2, mode: "number" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertJourneySchema = createInsertSchema(journeysTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertJourney = z.infer<typeof insertJourneySchema>;
export type Journey = typeof journeysTable.$inferSelect;
