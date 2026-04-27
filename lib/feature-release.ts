export type TimedFeatureKey = "findgems" | "trades" | "portfolio" | "multicharts";

type TimedFeatureConfig = {
  key: TimedFeatureKey;
  label: string;
  serverEnvVar: string;
  releaseAt: string;
};

const FEATURE_RELEASES: Record<TimedFeatureKey, TimedFeatureConfig> = {
  findgems: {
    key: "findgems",
    label: "Find Gems",
    serverEnvVar: "FEATURE_RELEASE_FINDGEMS_AT",
    releaseAt: process.env.FEATURE_RELEASE_FINDGEMS_AT || "",
  },
  trades: {
    key: "trades",
    label: "Find Trades",
    serverEnvVar: "FEATURE_RELEASE_TRADES_AT",
    releaseAt: process.env.FEATURE_RELEASE_TRADES_AT || "",
  },
  portfolio: {
    key: "portfolio",
    label: "Wallet Analyzer",
    serverEnvVar: "FEATURE_RELEASE_PORTFOLIO_AT",
    releaseAt: process.env.FEATURE_RELEASE_PORTFOLIO_AT || "",
  },
  multicharts: {
    key: "multicharts",
    label: "Multi Charts",
    serverEnvVar: "FEATURE_RELEASE_MULTICHARTS_AT",
    releaseAt: process.env.FEATURE_RELEASE_MULTICHARTS_AT || "",
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

export function isFeatureReleased(feature: TimedFeatureKey, now = Date.now()) {
  const releaseAtMs = parseFeatureReleaseDate(
    getFeatureReleaseConfig(feature).releaseAt
  );

  return !releaseAtMs || now >= releaseAtMs;
}
