import { Router, type IRouter } from "express";
import healthRouter from "./health";
import openaiRouter from "./openai/index";
import interviewRouter from "./interview";
import toolsRouter from "./tools";
import authRouter from "./auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(openaiRouter);
router.use(interviewRouter);
router.use(toolsRouter);

export default router;
