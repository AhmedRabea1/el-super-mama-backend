import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

// NODE_ENV=production → "public" schema (production data)
// NODE_ENV=development (default) → "dev" schema (dev/test data)
const IS_PROD = process.env.NODE_ENV === "production";
const DB_SCHEMA = IS_PROD ? "public" : "dev";

export default defineConfig({
  schema: path.join(__dirname, "./schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  schemaFilter: [DB_SCHEMA],
  out: path.join(__dirname, `./drizzle/${DB_SCHEMA}`),
});
