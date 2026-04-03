"use client";

import dynamic from "next/dynamic";
import { Clock3 } from "lucide-react";
import { useMemo, useState } from "react";

type SwapMode = "single" | "multi";

type SingleFormCache = {
  offerDenom: string;
  askDenom: string;
  pairAddress: string;
  totalAmount: string;
  chunkCount: string;
  totalMinutes: string;
};

type MultiFormCache = {
  offerDenom: string;
  askDenom: string;
  totalAmount: string;
  chunkCount: string;
  totalMinutes: string;
  minReceive: string;
};

type SwapFormCache = {
  mode: SwapMode;
  singleForm: SingleFormCache;
  multiForm: MultiFormCache;
};

const SwapForm = dynamic(
  () => import("./twap/SwapForm").then((mod) => mod.SwapForm),
  {
    ssr: false,
    loading: () => (
      <div className="text-sm text-white/60">Loading TWAP form…</div>
    ),
  }
);

const createEmptyCache = (): SwapFormCache => ({
  mode: "single",
  singleForm: {
    offerDenom: "",
    askDenom: "",
    pairAddress: "",
    totalAmount: "",
    chunkCount: "",
    totalMinutes: "",
  },
  multiForm: {
    offerDenom: "",
    askDenom: "",
    totalAmount: "",
    chunkCount: "",
    totalMinutes: "",
    minReceive: "",
  },
});

const formatAddress = (addr: string) => {
  if (!addr) return "Set TWAP_CONTRACT_ADDRESS";
  return addr.length > 16
    ? `${addr.slice(0, 10)}...${addr.slice(-6)}`
    : addr;
};

export default function TwapInterface() {
  const [formCache, setFormCache] = useState<SwapFormCache>(() =>
    createEmptyCache()
  );

  const twapContract = useMemo(
    () => process.env.TWAP_CONTRACT_ADDRESS || "",
    []
  );

  const resetForm = () => setFormCache(createEmptyCache());

  return (
    <section className="my-6 w-full">
      <div
        className="mx-auto max-w-5xl rounded-2xl border border-white/10 bg-gradient-to-br from-[#0c111c] via-[#0b0f17] to-[#0a0d14] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.55)]"
        style={{
          boxShadow: "0 35px 90px rgba(0,0,0,0.55)",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#22d3ee] to-[#6366f1] px-3 py-1 text-xs font-semibold text-black shadow-lg shadow-cyan-500/30">
              <Clock3 size={14} />
              <span>TWAP Scheduler</span>
            </div>
            <div className="text-[11px] text-white/60">
              Uses the same routing as Swap (denoms/pairs auto-selected).
            </div>
          </div>
          <div className="text-right text-[11px] leading-tight text-white/60">
            <div className="font-mono text-white">{formatAddress(twapContract)}</div>
            <div>Testnet</div>
          </div>
        </div>

        <div className="mt-5">
          <div className="rounded-2xl border border-[#1f2a44]/50 bg-[#0c111c]/80 p-4">
            <SwapForm
              initialMode={formCache.mode}
              cachedForm={formCache}
              onFormChange={setFormCache}
              onClear={resetForm}
              showModeToggle
              showInlineConnect
            />
          </div>
        </div>
      </div>
    </section>
  );
}
