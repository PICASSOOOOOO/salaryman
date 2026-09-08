import type { Request, Response, NextFunction } from "express";
import type { FeatureKey } from "@workspace/db";
import { hasFeature, FEATURE_CATALOG, isUsdPaidFeature } from "../lib/plan";

export function requireFeature(featureKey: FeatureKey) {
  const catalog = FEATURE_CATALOG[featureKey];
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated?.()) {
      res.status(401).json({ error: "Login required" });
      return;
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
