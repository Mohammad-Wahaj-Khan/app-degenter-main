// app/insights/page.tsx
import InsightsContent from "./components/InsightsContent";
import Navbar from "../components/navbar";
import TopMarketToken from "../components/TopMarketToken";
import { API_BASE_URL, API_HEADERS } from "@/lib/api";

async function getTokenData() {
  const baseUrl = API_BASE_URL.replace(/\/+$/, "");
  const endpoint = `${baseUrl}/tokens?bucket=24h&priceSource=best&dir=desc&includeChange=1&limit=300&offset=0&sort=volume`;

  try {
    const res = await fetch(endpoint, {
      headers: API_HEADERS,
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      console.warn("Insights token feed failed", res.status, res.statusText);
      return [];
    }

    const json = await res.json();

    const items = Array.isArray(json)
      ? json
      : Array.isArray(json?.data)
      ? json.data
      : Array.isArray(json?.data?.tokens)
      ? json.data.tokens
      : Array.isArray(json?.data?.items)
      ? json.data.items
      : [];
    const hasValidChange = (change: any) => {
      if (typeof change === "number") return true;
      if (!change || typeof change !== "object") return false;
      return Object.values(change).some(
        (value) => typeof value === "number" && value !== 0
      );
    };

    const normalized = await Promise.all(
      items.map(async (item: any) => {
        const symbol = item.symbol ?? item?.token?.symbol;
        const tokenId = item.tokenId ?? item?.token?.tokenId;
        const denom = item.denom ?? item?.token?.denom;
        const fetchRef = denom || tokenId;
        let priceChange =
          item?.price?.changePct ?? item?.priceChange ?? item?.price?.change;

        if (!hasValidChange(priceChange) && fetchRef) {
          try {
            const detailRes = await fetch(
              `${baseUrl}/tokens/${encodeURIComponent(fetchRef)}`,
              {
                headers: API_HEADERS,
                next: { revalidate: 60 },
              }
            );
            if (detailRes.ok) {
              const detailJson = await detailRes.json();
              priceChange =
                detailJson?.data?.price?.changePct ??
                detailJson?.data?.priceChange ??
                priceChange;
            }
          } catch {
            // Leave fallback as-is when detail fetch fails.
          }
        }

        return {
          symbol,
          name: item.name ?? item?.token?.name,
          imageUri: item.imageUri ?? item?.token?.imageUri,
          mcapUsd: item.mcapUsd,
          priceUsd: item.priceUsd ?? item?.price?.usd,
          volume: item.volume,
          volumeUSD: item.volumeUSD,
          volUsd: item.volUsd,
          priceChange,
        };
      })
    );

    return normalized
      .sort(
        (a: { volUsd: any }, b: { volUsd: any }) =>
          (b.volUsd ?? 0) - (a.volUsd ?? 0)
      )
      .slice(0, 200);
  } catch (error) {
    console.warn("Insights token feed threw during build", error);
    return [];
  }
}

export default async function InsightsPage() {
  const tokens = await getTokenData();

  return (
      <main className="flex min-h-screen flex-col bg-black relative overflow-hidden">
        <div
          className="absolute inset-0 z-1 h-60"
          style={{
            backgroundImage: `
            linear-gradient(
              120deg,
              #14624F 0%,
              #39C8A6 36.7%,
              #FA4E30 66.8%,
              #2D1B45 100%
            )
          `,
            backgroundSize: "cover",
            backgroundRepeat: "no-repeat",
            filter: "saturate(120%) contrast(110%) brightness(0.9)",
          }}
        >
          {/* Soft darkening/vignette to match the reference look */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                "linear-gradient(to bottom, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.65) 70%, rgba(0,0,0,0.9) 100%), radial-gradient(120% 120% at 50% 0%, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.45) 70%, rgba(0,0,0,0.75) 100%)",
              mixBlendMode: "multiply",
            }}
          />
          {/* Grain/Noise Overlay */}
          <div
            className="absolute inset-0 opacity-40 mix-blend-overlay pointer-events-none"
            style={{
              backgroundImage: `url("data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgdmlld0JveD0iMCAwIDEyOCAxMjgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGZpbHRlciBpZD0ibm9pc2UiIHg9IjAlIiB5PSIwJSIgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSI+PGZlVHVyYnVsZW5jZSB0eXBlPSJmcmFjdGFsTm9pc2UiIGJhc2VGcmVxdWVuY3k9IjAuOTgiIG51bU9jdGF2ZXM9IjUiIHN0aXRjaFRpbGVzPSJzdGl0Y2giLz48L2ZpbHRlcj48cmVjdCB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgZmlsdGVyPSJ1cmwoI25vaXNlKSIvPjwvc3ZnPg==")`,
              backgroundRepeat: "repeat",
              backgroundSize: "96px 96px",
              filter: "contrast(120%)",
            }}
          />

          {/* Fade overlay to blend bottom edge */}
          <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-b from-transparent to-black"></div>
        </div>
      <div className="animate-header relative z-20">
        <Navbar />
        <TopMarketToken />
      </div>
      <InsightsContent tokens={tokens} />
    </main>
  );
}
