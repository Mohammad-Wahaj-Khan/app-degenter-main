import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_ZIGSCAN_BETA_URL = "https://dev-api-v3.zigscan.org/v3";

function normalizeZigscanBaseUrl(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return DEFAULT_ZIGSCAN_BETA_URL;

  const withoutTrailingSlash = trimmed.replace(/\/+$/, "");
  return withoutTrailingSlash.endsWith("/docs")
    ? withoutTrailingSlash.slice(0, -"/docs".length)
    : withoutTrailingSlash;
}

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { status: "0", message, result: null },
    { status, headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
) {
  const { path = [] } = await context.params;
  const baseUrl = normalizeZigscanBaseUrl(process.env.ZIGSCAN_API_BETA_URL);
  const apiKey = process.env.ZIGSCAN_API_BETA_KEY;

  if (!apiKey) {
    return jsonError("Missing Zigscan beta API key", 500);
  }

  const targetUrl = new URL(`${baseUrl}/${path.map(encodeURIComponent).join("/")}`);
  request.nextUrl.searchParams.forEach((value, key) => {
    targetUrl.searchParams.append(key, value);
  });

  try {
    const upstream = await fetch(targetUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "x-api-key": apiKey,
      },
      cache: "no-store",
    });

    const body = await upstream.text();
    const contentType = upstream.headers.get("content-type") || "application/json";

    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("Zigscan beta proxy failed:", error);
    return jsonError("Failed to reach Zigscan beta API", 502);
  }
}
