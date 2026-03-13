import { Router, type IRouter } from "express";
import healthRouter from "./health";
import openaiRouter from "./openai/index";
import interviewRouter from "./interview";
import toolsRouter from "./tools";
import authRouter from "./auth";
import accountRouter from "./account";
import workspaceRouter from "./workspace";
import planRouter from "./plan";
import worldRouter from "./world";
import salarymanSavesRouter from "./salaryman-saves";
import billboardRouter from "./billboards";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(openaiRouter);
router.use(interviewRouter);
router.use(toolsRouter);
router.use(accountRouter);
router.use(workspaceRouter);
router.use(planRouter);
router.use(worldRouter);
router.use(salarymanSavesRouter);
router.use(billboardRouter);

export default router;
