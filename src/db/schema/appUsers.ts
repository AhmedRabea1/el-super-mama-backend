import { pgTable, serial, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { programsTable } from "./programs";

export const appUsersTable = pgTable("app_users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  phone: text("phone"),
  stage: text("stage"),
  programId: integer("program_id").references(() => programsTable.id, { onDelete: "set null" }),
  currentDay: integer("current_day").notNull().default(1),
  isActive: boolean("is_active").notNull().default(true),
  subscriptionStatus: text("subscription_status"),
  notes: text("notes"),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAppUserSchema = createInsertSchema(appUsersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAppUser = z.infer<typeof insertAppUserSchema>;
export type AppUser = typeof appUsersTable.$inferSelect;
