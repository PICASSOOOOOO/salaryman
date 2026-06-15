import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { authMiddleware } from "./middlewares/authMiddleware";
import router from "./routes";
import sitesProxyRouter from "./sites-proxy";

declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

const app: Express = express();

app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use((req, res, next) => {
  if (req.originalUrl === "/api/stripe/webhook") {
    next();
  } else if (req.originalUrl.startsWith("/api/bots/webhook/")) {
    express.json({
      limit: "50mb",
      verify: (_req, _res, buf) => {
        req.rawBody = buf;
      },
    })(req, res, next);
  } else {
    express.json({ limit: "50mb" })(req, res, next);
  }
});
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Default req.body to {} for any request that didn't carry a parseable body
// (missing/incorrect Content-Type, empty payload, scanner traffic). Without
// this, route handlers that destructure req.body crash with the production
// error: "Cannot destructure property 'X' of 't.body' as it is undefined".
app.use((req, _res, next) => {
  if (req.body == null) req.body = {};
  next();
});

app.use(authMiddleware);

app.use("/api", router);

// Public reverse-proxy for org Framer sites at /sites/<slug>. Must sit ABOVE the
// production static middleware + SPA splat so it isn't swallowed by index.html.
app.use("/sites", sitesProxyRouter);

if (process.env.NODE_ENV === "production") {
  const staticPath = path.resolve(__dirname, "../../interview-helper/dist/public");
  app.use(express.static(staticPath));
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });
}

export default app;
