import type { Request, Response, NextFunction } from "express";
import type { FeatureKey } from "@workspace/db";
import { hasFeature, FEATURE_CATALOG, isUsdPaidFeature } from "../lib/plan";
import { getCompletedOnboarding } from "./requireOnboarding";

export function requireFeature(featureKey: FeatureKey) {
  const catalog = FEATURE_CATALOG[featureKey];
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated?.()) {
      res.status(401).json({ error: "Login required" });
      return;
    }
    // Payment never substitutes for the browser product's basic onboarding.
    // The registry row is the server-authoritative completion signal, so this
    // cannot be bypassed with a local tutorial flag or a paid feature grant.
    if (isUsdPaidFeature(featureKey)) {
      if (!await getCompletedOnboarding(String(req.user.id))) {
        res.status(403).json({
          error: "Complete onboarding before using paid features",
          feature: featureKey,
          featureName: catalog.name,
          onboardingRequired: true,
          onboarding: "/onboarding",
        });
        return;
      }
    }
    const has = await hasFeature(req.user.id, req.user.email, featureKey);
    if (!has) {
      res.status(403).json({
        error: `${catalog.name} subscription required`,
        feature: featureKey,
        featureName: catalog.name,
        price: catalog.price,
        ...(isUsdPaidFeature(featureKey) ? { currency: "usd", paymentRequired: true } : {}),
        upgrade: "/upgrade",
      });
      return;
    }
    next();
  };
}

export function requirePro(feature?: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated?.()) {
      res.status(401).json({ error: "Login required" });
      return;
    }
    next();
  };
}
