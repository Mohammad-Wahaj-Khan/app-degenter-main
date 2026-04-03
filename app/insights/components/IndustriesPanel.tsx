"use client";

import type { FC } from "react";
import { Token } from "@/types/token";

type IndustryView = "memes-token" | "capital-flow";

type IndustriesPanelProps = {
  view: IndustryView;
  data: Token[];
};

const INDUSTRY_HIGHLIGHTS = [
  {
    industry: "Decentralized Finance",
    coverage: 72,
    change: 4.8,
    focus: "Lending, AMMs, stablecoin liquidity",
    accent: "from-[#39C8A6] to-[#57F3BB]",
  },
  {
    industry: "Web3 Infrastructure",
    coverage: 56,
    change: 3.1,
    focus: "Layer 1/2, middleware & oracles",
    accent: "from-[#8CBCF8] to-[#3B82F6]",
  },
  {
    industry: "Gaming & Metaverse",
    coverage: 39,
    change: -1.4,
    focus: "Play-to-earn economies & NFT hubs",
    accent: "from-[#FFD166] to-[#F97316]",
  },
];

const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const fullNumberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const normalizeChangeValue = (change?: Token["priceChange"]) => {
  if (change == null) return 0;
  if (typeof change === "number") return change;
  const numeric = Object.values(change).find(
    (value): value is number => typeof value === "number"
  );
  return numeric ?? 0;
};

const normalizeVolume = (token: Token) => {
  if (typeof token.volUsd === "number") return token.volUsd;
  if (typeof token.volumeUSD === "number") return token.volumeUSD;
  if (typeof token.volume === "number") return token.volume;
  if (typeof token.volume === "object" && token.volume !== null) {
    const candidate = Object.values(token.volume).find(
      (value): value is number => typeof value === "number"
    );
    if (candidate) return candidate;
  }
  if (typeof token.volumeUSD === "object" && token.volumeUSD !== null) {
    const candidate = Object.values(token.volumeUSD).find(
      (value): value is number => typeof value === "number"
    );
    if (candidate) return candidate;
  }
  return 0;
};

const formatCurrency = (value?: number) =>
  `$${fullNumberFormatter.format(value ?? 0)}`;

const formatCompact = (value?: number) => compactFormatter.format(value ?? 0);

const formatChange = (value: number) =>
  `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

const IndustriesPanel: FC<IndustriesPanelProps> = ({ view, data }) => {
  const totalFlow = data.reduce((sum, token) => sum + normalizeVolume(token), 0);
  const topTokens = data.slice(0, 4);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="px-6 pt-6">
        <p className="text-xs font-semibold uppercase tracking-[0.4em] text-zinc-500">
          Industries
        </p>
        <h3 className="mt-2 text-2xl font-semibold text-white">
          {view === "memes-token"
            ? "Meme Tokens"
            : "Capital flow snapshot"}
        </h3>
        <p className="mt-1 text-sm text-zinc-400">
          {view === "memes-token"
            ? "Signals drawn from protocol performance, liquidity, and adoption trends."
            : "Top tokens driving industry-level volume flow in the last 24 hours."}
        </p>
      </div>
      {view === "memes-token" ? (
        <div className="grid gap-4 px-6 pb-6 md:grid-cols-3">
          {INDUSTRY_HIGHLIGHTS.map((highlight) => (
            <div
              key={highlight.industry}
              className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-gradient-to-b from-white/5 to-transparent p-5"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.4em] text-zinc-500">
                {highlight.industry}
              </p>
              <div>
                <p className="text-2xl font-semibold text-white">
                  {formatChange(highlight.change)}
                </p>
                <p className="text-xs text-zinc-500">Momentum</p>
              </div>
              <p className="text-sm text-zinc-400">{highlight.focus}</p>
              <div className="flex flex-col gap-1">
                <div className="h-1.5 rounded-full bg-zinc-900">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${highlight.accent}`}
                    style={{ width: `${highlight.coverage}%` }}
                  />
                </div>
                <span className="text-xs uppercase tracking-[0.3em] text-zinc-500">
                  {highlight.coverage}% coverage
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-5 px-6 pb-6">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-zinc-500">
              Total industry volume
            </p>
            <p className="mt-4 text-3xl font-semibold text-white">
              {formatCurrency(totalFlow)}
            </p>
            <p className="text-xs uppercase tracking-[0.4em] text-zinc-500">
              24h rolling volume
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40">
            <div className="divide-y divide-zinc-900">
              {topTokens.map((token) => {
                const change = normalizeChangeValue(token.priceChange);
                return (
                  <div
                    key={token.symbol}
                    className="flex items-center justify-between px-5 py-4"
                  >
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {token.symbol}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {token.name ?? "—"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={`text-sm font-semibold ${
                          change >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {formatChange(change)}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {formatCompact(normalizeVolume(token))} vol
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IndustriesPanel;
