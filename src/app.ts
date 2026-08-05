import path from "path";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import router from "./routes";

const app: Express = express();

const IS_PROD = process.env.NODE_ENV === "production";
const LOG_LEVEL = process.env.LOG_LEVEL ?? (IS_PROD ? "warn" : "debug");

// ── CORS ─────────────────────────────────────────────────────────────────────
// In dev: allow all origins (Expo preview domains vary)
// In prod: allow same-origin + known deployment domains
const corsOptions = IS_PROD
  ? {
      origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
        // Allow requests with no origin (mobile apps, curl) or same-origin
        if (!origin || origin.includes("replit.app") || origin.includes("repl.co")) {
          cb(null, true);
        } else {
          cb(null, false);
        }
      },
      credentials: true,
    }
  : { origin: true, credentials: true };

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Request logger (dev only) ─────────────────────────────────────────────────
if (LOG_LEVEL === "debug") {
  app.use((req: Request, _res: Response, next: NextFunction) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

// ── Static uploads ───────────────────────────────────────────────────────────
// Served under /api since that's the only path prefix the reverse proxy in
// front of this server actually forwards here — anything outside /api falls
// through to the admin dashboard's frontend routing instead.
app.use("/api/uploads", express.static(path.join(process.cwd(), "uploads")));

// ── Routes ───────────────────────────────────────────────────────────────────
app.use("/api", router);

// ── Global error handler ─────────────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (LOG_LEVEL !== "warn") {
    console.error("[ERROR]", err.message, err.stack);
  } else {
    console.error("[ERROR]", err.message);
  }
  res.status(500).json({ error: IS_PROD ? "Internal server error" : err.message });
});

export default app;
