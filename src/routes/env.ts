import { Router } from "express";
import { DB_SCHEMA, IS_PROD } from "../db";

const router = Router();

// GET /api/env — returns current environment info (safe, no secrets)
router.get("/env", (_req, res) => {
  res.json({
    environment: IS_PROD ? "production" : "development",
    dbSchema: DB_SCHEMA,
    nodeEnv: process.env.NODE_ENV ?? "development",
  });
});

export default router;
