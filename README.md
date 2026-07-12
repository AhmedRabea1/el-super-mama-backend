# El Super Mama — Backend

Express.js API server for the El Super Mama mobile app and admin portal.

## Stack

- **Server**: Express 5 (Node.js)
- **Database**: PostgreSQL via Drizzle ORM — schema vendored locally in `src/db/` (no external workspace dependency)
- **Validation**: Zod schemas vendored locally in `src/api-zod/`
- **Auth**: JWT (`jsonwebtoken`), passwords hashed with `bcryptjs`

## Getting started

```bash
pnpm install
```

Set the required environment variables (no defaults — the server refuses to start without them):

| Variable | Example | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql://localhost:5432/el_super_mama` | Postgres connection string |
| `PORT` | `8083` | Port the server listens on |
| `JWT_SECRET` | (random string) | Signs/verifies login tokens — use a long random value in production |
| `NODE_ENV` | `production` or `development` | Also controls which Postgres **schema** is used (`public` in production, `dev` in development) — see `src/db/index.ts` |

```bash
DATABASE_URL="postgresql://localhost:5432/el_super_mama" NODE_ENV=production PORT=8083 JWT_SECRET="change-me" pnpm run dev
```

## Database

```bash
pnpm run db:push          # push the schema to your database (interactive if there are risky changes)
pnpm run db:push-force    # same, without the confirmation prompt
pnpm run db:seed:dev      # seed the admin account into the "dev" schema
pnpm run db:seed:prod     # seed the admin account into the "public" schema
```

## Scripts

- `pnpm run dev` — start the server with `tsx` (no build step)
- `pnpm run build` — bundle for production with esbuild, output to `dist/index.cjs`
- `pnpm run typecheck` — TypeScript check, no emit

## Updating the API contract

`src/api-zod/` is generated from the project's OpenAPI spec. If the API contract changes, regenerate it there and copy the updated files into `src/api-zod/generated/`.
