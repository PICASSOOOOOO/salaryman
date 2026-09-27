import express, { type ErrorRequestHandler, type Express } from "express";
import { randomUUID } from "node:crypto";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import pinoHttp from "pino-http";
import { authMiddleware } from "./middlewares/authMiddleware";
import { anonymousAccessMiddleware } from "./middlewares/anonymousAccess";
import { logger } from "./lib/logger";
import { isPabloRequestId, safePabloErrorFields } from "./lib/pablo-chat-diagnostics";
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

// Keep detailed access logs scoped to Pablo chat. The validated request ID is
// echoed to the browser so client diagnostics can be matched without logging
// request bodies, cookies, or query strings.
app.use("/api/chat/pablo", pinoHttp({
  logger,
  genReqId(req, res) {
    const incomingId = req.headers["x-request-id"];
    const requestId = isPabloRequestId(incomingId) ? incomingId : randomUUID();
    res.setHeader("X-Request-Id", requestId);
    return requestId;
  },
  serializers: {
    req(req) {
      return {
        id: req.id,
        method: req.method,
        url: req.url?.split("?")[0],
      };
    },
    res(res) {
      return { statusCode: res.statusCode };
    },
  },
}));

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

// Lightweight health probes — answered before auth so platform cold-boot
// probes get an immediate 200 even while seeders are running in the background.
app.get("/api/healthz", (_req, res) => {
  res.json({ status: "ok" });
});
app.get("/api", (_req, res) => {
  res.json({ status: "ok" });
});
// Plain HTTP GET /ws probe (non-WebSocket-upgrade) returns OK for health checks.
app.get("/ws", (_req, res) => {
  res.json({ status: "ok" });
});

app.use(authMiddleware);

app.get("/api/visitor-access", anonymousAccessMiddleware, (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.isAuthenticated?.()) {
    res.json({ authenticated: true, expired: false });
    return;
  }
  res.json({
    authenticated: false,
    startedAt: req.anonymousAccess?.startedAt ?? Date.now(),
    expiresAt: req.anonymousAccess?.expiresAt ?? Date.now(),
    expired: req.anonymousAccess?.expired ?? false,
    limitDays: 5,
  });
});

app.use("/api", anonymousAccessMiddleware, router);

const logUnhandledPabloError: ErrorRequestHandler = (error, req, _res, next) => {
  const path = req.originalUrl.split("?")[0];
  if (path.startsWith("/api/chat/pablo/") && req.log) {
    req.log.error(
      { phase: "unhandled-route-error", ...safePabloErrorFields(error) },
      "Unhandled Pablo chat API error",
    );
  }
  next(error);
};
app.use(logUnhandledPabloError);

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
