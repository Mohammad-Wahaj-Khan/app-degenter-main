"use client";
import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { API_BASE_URL, API_HEADERS } from "@/lib/api";
const API_BASE = API_BASE_URL;

export default function AllSpcPairs() {
  const [open, setOpen] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`${API_BASE}/tokens/stzig/pools`, {
          headers: API_HEADERS,
        });
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) setData(json.data);
      } catch (e) {
        console.error("Failed to fetch pools:", e);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  return (
    <div className="w-full  max-w-3xl mx-auto mt-6   z-[50] ">

      {/* Content */}
      {open && (
        <div
            style={{
                // 31%: transparent black, 74%: #54D588 at 50% opacity, 99%: #009597 at 100%
            backgroundImage:
              'linear-gradient(130deg,  rgba(247 80 50 / 0.5)   2%, #000000 34%, rgba(84 37 65)  99%)',
          }}
            className="absolute z-[50] mt-4 top-[18px] w-full bg-black rounded-b-xl backdrop-blur-[50px] shadow-[0_10px_40px_-10px_rgba(0,0,0,0.7)] overflow-hidden"
            >
          {loading ? (
            <div className="text-start text-gray-400">Loading pools...</div>
          ) : data.length === 0 ? (
            <div className="text-start text-gray-400">No pairs found.</div>
          ) : (
            data.map((p, i) => (
              <div
                key={i}
                className=" p-4 flex flex-col sm:flex-column rounded-b-lg sm:items-start sm:justify-between "
              >
                <div>
                  <div className="text-white font-medium text-base">
                    {p.base.symbol} / {p.quote.symbol}
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 mt-3 sm:mt-0 text-sm text-gray-300">
                  <div>
                    <span className="block text-gray-400 text-xs">TVL</span>
                    ${p.tvlUsd?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                  <div>
                    <span className="block text-gray-400 text-xs">Vol (24h)</span>
                    ${p.volumeUsd?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                  <div>
                    <span className="block text-gray-400 text-xs">Price</span>
                    {p.priceNative ? p.priceNative.toFixed(3) : "--"}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
