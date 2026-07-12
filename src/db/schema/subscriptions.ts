import { pgTable, serial, integer, text, timestamp, boolean, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { appUsersTable } from "./appUsers";

export const subscriptionsTable = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => appUsersTable.id, { onDelete: "set null" }),
  productId: text("product_id").notNull(),
  status: text("status").notNull().default("active"),
  startsAt: timestamp("starts_at"),
  expiresAt: timestamp("expires_at"),
  autoRenews: boolean("auto_renews").notNull().default(true),
  store: text("store"),
  priceUsd: numeric("price_usd", { precision: 10, scale: 2 }),
  revenuecatUserId: text("revenuecat_user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSubscriptionSchema = createInsertSchema(subscriptionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptionsTable.$inferSelect;
