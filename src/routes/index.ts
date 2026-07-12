import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import envRouter from "./env.js";
import adminAuthRouter from "./adminAuth.js";
import adminStatsRouter from "./adminStats.js";
import adminUsersRouter from "./adminUsers.js";
import adminSubscriptionsRouter from "./adminSubscriptions.js";
import adminTransactionsRouter from "./adminTransactions.js";
import adminProgramsRouter from "./adminPrograms.js";
import appAuthRouter from "./appAuth.js";
import webhooksRouter from "./webhooks.js";
import foodRouter from "./food.js";
import wellnessRouter from "./wellness.js";
import pregnancyJourneyRouter from "./pregnancyJourney.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(envRouter);
router.use(adminAuthRouter);
router.use(adminStatsRouter);
router.use(adminUsersRouter);
router.use(adminSubscriptionsRouter);
router.use(adminTransactionsRouter);
router.use(adminProgramsRouter);
router.use(appAuthRouter);
router.use(webhooksRouter);
router.use(foodRouter);
router.use(wellnessRouter);
router.use(pregnancyJourneyRouter);

export default router;
  