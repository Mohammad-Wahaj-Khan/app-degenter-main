import { NextResponse, type NextRequest } from "next/server";
import {
  getFeatureReleaseConfig,
  isFeatureReleased,
  parseFeatureReleaseDate,
  type TimedFeatureKey,
} from "@/lib/feature-release";

const featureKeys: TimedFeatureKey[] = [
  "findgems",
  "trades",
  "portfolio",
  "multicharts",
];

function isTimedFeatureKey(value: string | null): value is TimedFeatureKey {
  return featureKeys.includes(value as TimedFeatureKey);
}

export function GET(request: NextRequest) {
  const feature = request.nextUrl.searchParams.get("feature");
  const serverNowMs = Date.now();

  if (!isTimedFeatureKey(feature)) {
    return NextResponse.json(
      { error: "INVALID_FEATURE" },
      { status: 400, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  const config = getFeatureReleaseConfig(feature);

  return NextResponse.json(
    {
      key: config.key,
      label: config.label,
      releaseAt: config.releaseAt,
      releaseAtMs: parseFeatureReleaseDate(config.releaseAt),
      serverNowMs,
      released: isFeatureReleased(feature, serverNowMs),
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
