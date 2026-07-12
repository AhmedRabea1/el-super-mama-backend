import { pgTable, serial, integer, text, timestamp, numeric, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { appUsersTable } from "./appUsers";

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => appUsersTable.id, { onDelete: "set null" }),
  type: text("type").notNull(),
  productId: text("product_id"),
  amountUsd: numeric("amount_usd", { precision: 10, scale: 2 }),
  store: text("store"),
  originalTransactionId: text("original_transaction_id"),
  raw: jsonb("raw"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({ id: true, createdAt: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;
