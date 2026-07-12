/**
 * Database seed script
 *
 * Dev:  NODE_ENV=development tsx seed.ts
 * Prod: NODE_ENV=production  tsx seed.ts
 *
 * Seeds the admin user into whichever schema is active (dev or public).
 */
import bcrypt from "bcryptjs";
import { db, DB_SCHEMA } from "../index.js";
import { adminUsersTable } from "../schema/index.js";
import { eq } from "drizzle-orm";

const ADMIN_EMAIL = "admin@elsupermama.com";
const ADMIN_PASSWORD = "Admin@SuperMama123";
const ADMIN_NAME = DB_SCHEMA === "public" ? "Super Admin" : "Super Admin (Dev)";

async function seed() {
  console.log(`Seeding ${DB_SCHEMA} schema...`);

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  const existing = await db
    .select()
    .from(adminUsersTable)
    .where(eq(adminUsersTable.email, ADMIN_EMAIL))
    .limit(1);

  if (existing.length > 0) {
    console.log(`Admin user already exists in ${DB_SCHEMA} schema. Updating password...`);
    await db
      .update(adminUsersTable)
      .set({ passwordHash, name: ADMIN_NAME, updatedAt: new Date() })
      .where(eq(adminUsersTable.email, ADMIN_EMAIL));
  } else {
    await db.insert(adminUsersTable).values({
      email: ADMIN_EMAIL,
      passwordHash,
      name: ADMIN_NAME,
      role: "super_admin",
      isActive: true,
    });
    console.log(`Admin user created in ${DB_SCHEMA} schema.`);
  }

  console.log(`Done. Admin: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
