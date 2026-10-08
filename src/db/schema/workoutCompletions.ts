import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { appUsersTable } from "./appUsers";

// One row per completed workout day — written by POST
// /users/me/enrollment/advance-day. Multiple rows can share the same
// calendar date; "workoutsThisWeek" and streak calculations dedupe by date
// at query time, not here.
export const workoutCompletionsTable = pgTable("workout_completions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => appUsersTable.id, { onDelete: "cascade" }),
  programId: text("program_id"),
  // withTimezone: this column drives exact UTC day-boundary math (streaks,
  // "this week"), so it must store an unambiguous instant. A plain
  // `timestamp` column would have Postgres cast `now()`'s value through the
  // server's session timezone before storing it (wrong wall-clock numbers),
  // which then get misread as literal UTC on the way back out.
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWorkoutCompletionSchema = createInsertSchema(workoutCompletionsTable).omit({ id: true });
export type InsertWorkoutCompletion = z.infer<typeof insertWorkoutCompletionSchema>;
export type WorkoutCompletion = typeof workoutCompletionsTable.$inferSelect;
