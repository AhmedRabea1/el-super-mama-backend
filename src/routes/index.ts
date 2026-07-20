import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import envRouter from "./env.js";
import adminAuthRouter from "./adminAuth.js";
import adminStatsRouter from "./adminStats.js";
import adminUsersRouter from "./adminUsers.js";
import adminSubscriptionsRouter from "./adminSubscriptions.js";
import adminTransactionsRouter from "./adminTransactions.js";
import adminProgramsRouter from "./adminPrograms.js";
import adminRecipesRouter from "./adminRecipes.js";
import adminDailyTargetsRouter from "./adminDailyTargets.js";
import adminFoodTipsRouter from "./adminFoodTips.js";
import adminPlansRouter from "./adminPlans.js";
import adminJourneysRouter from "./adminJourneys.js";
import appAuthRouter from "./appAuth.js";
import webhooksRouter from "./webhooks.js";
import foodRouter from "./food.js";
import wellnessRouter from "./wellness.js";
import pregnancyJourneyRouter from "./pregnancyJourney.js";
import programsRouter from "./programs.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(envRouter);
router.use(adminAuthRouter);
router.use(adminStatsRouter);
router.use(adminUsersRouter);
router.use(adminSubscriptionsRouter);
router.use(adminTransactionsRouter);
router.use(adminProgramsRouter);
router.use(adminRecipesRouter);
router.use(adminDailyTargetsRouter);
router.use(adminFoodTipsRouter);
router.use(adminPlansRouter);
router.use(adminJourneysRouter);
router.use(appAuthRouter);
router.use(webhooksRouter);
router.use(foodRouter);
router.use(wellnessRouter);
router.use(pregnancyJourneyRouter);
router.use(programsRouter);

export default router;
  