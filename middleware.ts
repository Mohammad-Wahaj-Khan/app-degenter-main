import { NextResponse, type NextRequest } from "next/server";
import {
  getFeatureReleaseConfig,
  isFeatureReleased,
  type TimedFeatureKey,
} from "@/lib/feature-release";

const protectedApiPrefixes: Array<{
  feature: TimedFeatureKey;
  prefixes: string[];
}> = [
  {
    feature: "findgems",
    prefixes: ["/api/findgems", "/api/gems"],
  },
  {
    feature: "trades",
    prefixes: ["/api/trades"],
  },
  {
    feature: "portfolio",
    prefixes: [
      "/api/portfolio",
      "/api/wallet-analyzer",
      "/api/wallet-tracker",
      "/api/wallets",
    ],
  },
];

function matchedProtectedFeature(pathname: string) {
  return protectedApiPrefixes.find(({ prefixes }) =>
    prefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    )
  )?.feature;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const feature = matchedProtectedFeature(pathname);

  if (!feature || isFeatureReleased(feature)) {
    return NextResponse.next();
  }

  const config = getFeatureReleaseConfig(feature);

  return NextResponse.json(
    {
      error: "FEATURE_LOCKED",
      message: `${config.label} is not live yet.`,
      releaseAt: config.releaseAt,
    },
    {
      status: 403,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Feature-Locked": feature,
      },
    }
  );
}

export const config = {
  matcher: ["/api/:path*"],
};
