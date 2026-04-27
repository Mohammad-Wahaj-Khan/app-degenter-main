"use client";

export type TimedFeatureKey = "findgems" | "trades" | "portfolio";

type TimedFeatureConfig = {
  key: TimedFeatureKey;
  label: string;
  envVar: string;
  releaseAt: string;
};

const FEATURE_RELEASES: Record<TimedFeatureKey, TimedFeatureConfig> = {
  findgems: {
    key: "findgems",
    label: "Find Gems",
    envVar: "NEXT_PUBLIC_FEATURE_RELEASE_FINDGEMS_AT",
    releaseAt: process.env.NEXT_PUBLIC_FEATURE_RELEASE_FINDGEMS_AT || "",
  },
  trades: {
    key: "trades",
    label: "Find Trades",
    envVar: "NEXT_PUBLIC_FEATURE_RELEASE_TRADES_AT",
    releaseAt: process.env.NEXT_PUBLIC_FEATURE_RELEASE_TRADES_AT || "",
  },
  portfolio: {
    key: "portfolio",
    label: "Wallet Analyzer",
    envVar: "NEXT_PUBLIC_FEATURE_RELEASE_PORTFOLIO_AT",
    releaseAt: process.env.NEXT_PUBLIC_FEATURE_RELEASE_PORTFOLIO_AT || "",
  },
};

export function getFeatureReleaseConfig(feature: TimedFeatureKey) {
  return FEATURE_RELEASES[feature];
}

export function parseFeatureReleaseDate(value?: string | null) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}
