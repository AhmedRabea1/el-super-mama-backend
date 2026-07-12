import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// In development: tables live in the "dev" schema
// In production:  tables live in the "public" schema
export const IS_PROD = process.env.NODE_ENV === "production";
export const DB_SCHEMA = IS_PROD ? "public" : "dev";

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Set search_path on every new client so Drizzle queries hit the right schema
pool.on("connect", (client) => {
  client.query(`SET search_path TO ${DB_SCHEMA}`);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
