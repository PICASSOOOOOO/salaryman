import { Router, type IRouter } from "express";
import healthRouter from "./health";
import openaiRouter from "./openai/index";
import interviewRouter from "./interview";

const router: IRouter = Router();

router.use(healthRouter);
router.use(openaiRouter);
router.use(interviewRouter);

export default router;
