"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import BubbleMap from "./BubbleMap";

type Token = {
  symbol: string;
  name: string;
  imageUri?: string;
  mcapUsd?: number;
  priceChange?: Record<string, number> | number;
  priceUsd?: number;
  volume?: Record<string, number>;
  volumeUSD?: Record<string, number>;
  volUsd?: number;
};

const TIMEFRAMES = ["30M", "1H", "4H", "24H"] as const;

type TimeFrame = (typeof TIMEFRAMES)[number];

type BubbleMapPanelProps = {
  data: Token[];
};

const BubbleMapPanel: React.FC<BubbleMapPanelProps> = ({ data }) => {
  const [timeFrame, setTimeFrame] = useState<TimeFrame>("24H");

  return (
    <>
      <header className="p-4 border-b border-zinc-800 flex items-center">
        <div className="flex items-center gap-2">
          <h1 className="text-white font-medium uppercase tracking-tighter">
            Bubble Map
          </h1>
          <Info size={14} className="text-zinc-500 cursor-help" />
        </div>
      </header>

      <section className="flex-1 p-4 relative overflow-hidden bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-900/20 to-black">
        <div className="absolute top-4 right-4 z-10 flex bg-zinc-900/90 p-1 rounded text-xs border border-zinc-800 backdrop-blur">
          {TIMEFRAMES.map((t) => (
            <button
              key={t}
              className={`px-3 py-1 rounded ${
                t === timeFrame ? "bg-zinc-800 text-orange-500" : ""
              }`}
              onClick={() => setTimeFrame(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <BubbleMap data={data} timeFrame={timeFrame} />
      </section>
    </>
  );
};

export default BubbleMapPanel;
