import { pgTable, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { journeysTable } from "./journeys";
import { programsTable } from "./programs";

export const journeyProgramsTable = pgTable(
  "journey_programs",
  {
    id: serial("id").primaryKey(),
    journeyId: integer("journey_id").notNull().references(() => journeysTable.id, { onDelete: "cascade" }),
    programId: integer("program_id").notNull().references(() => programsTable.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [unique().on(table.journeyId, table.programId)],
);

export const insertJourneyProgramSchema = createInsertSchema(journeyProgramsTable).omit({ id: true, createdAt: true });
export type InsertJourneyProgram = z.infer<typeof insertJourneyProgramSchema>;
export type JourneyProgram = typeof journeyProgramsTable.$inferSelect;
