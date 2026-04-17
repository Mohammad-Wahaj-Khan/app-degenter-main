"use client";

import React from "react";
import { Wallet, ShieldCheck, Coins, ArrowUpRight, Activity } from "lucide-react";

type DelegationResponse = {
  delegation: {
    delegator_address: string;
    validator_address: string;
    shares: string;
  };
  balance: {
    denom: string;
    amount: string;
  };
};

type DelegationsApiResponse = {
  delegation_responses: DelegationResponse[];
  pagination?: {
    next_key: string | null;
    total: string;
  };
};

type ValidatorsDelegationsPanelProps = {
  address?: string;
};

const formatZigAmount = (value?: string) => {
  if (!value) return "0";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 6,
    minimumFractionDigits: 0,
  }).format(parsed / 1_000_000);
};

export default function ValidatorsDelegationsPanel({
  address,
}: ValidatorsDelegationsPanelProps) {
  const [delegations, setDelegations] = React.useState<DelegationResponse[]>([]);
  const [delegationsLoading, setDelegationsLoading] = React.useState(false);
  const [delegationsError, setDelegationsError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!address) {
      setDelegations([]);
      setDelegationsError(null);
      setDelegationsLoading(false);
      return;
    }

    const controller = new AbortController();
    let active = true;

    const loadDelegations = async () => {
      setDelegationsLoading(true);
      setDelegationsError(null);

      try {
        const res = await fetch(
          `https://zigchain-lcd.degenter.io/cosmos/staking/v1beta1/delegations/${encodeURIComponent(address)}`,
          {
            cache: "no-store",
            signal: controller.signal,
            headers: { Accept: "application/json" },
          }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        const data = (await res.json()) as DelegationsApiResponse;
        if (!active) return;
        setDelegations(Array.isArray(data?.delegation_responses) ? data.delegation_responses : []);
      } catch (err) {
        if (!active) return;
        setDelegationsError(err instanceof Error ? err.message : "Failed to load delegations");
      } finally {
        if (active) setDelegationsLoading(false);
      }
    };

    loadDelegations();
    return () => {
      active = false;
      controller.abort();
    };
  }, [address]);

  return (
    <section className="relative mt-8 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#060606] via-[#0c0c0c] to-[#111318] p-6 shadow-2xl">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#1c1c1c,transparent_60%)] opacity-60" />
      <div className="absolute -right-32 -top-24 h-72 w-72 rounded-full bg-emerald-500/10 blur-[140px]" />
      <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-cyan-500/10 blur-[120px]" />

      <header className="relative mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-zinc-400">
            <Activity className="h-3.5 w-3.5 text-emerald-400" />
            DeFi Validators
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Delegation Overview
          </h2>
          <p className="text-sm text-zinc-400">
            Live staking positions for this wallet.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-200">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Live Network
        </div>
      </header>

      <div className="relative space-y-4">
        {delegationsLoading && (
          <div className="grid grid-cols-1 gap-4">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-44 animate-pulse rounded-2xl border border-white/10 bg-white/5"
              />
            ))}
          </div>
        )}

        {delegationsError && (
          <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-8 text-sm text-red-300">
            Error: {delegationsError}
          </div>
        )}

        {!delegationsLoading && !delegationsError && delegations.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-8 py-12 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
              <Wallet className="h-6 w-6 text-zinc-500" />
            </div>
            <p className="text-sm text-zinc-400">
              No active delegations found for this address.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 ">
          {delegations.map((item, index) => (
            <article
              key={`${item.delegation.validator_address}-${index}`}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 via-transparent to-transparent p-5 shadow-[0_0_30px_rgba(0,0,0,0.25)] transition hover:border-emerald-500/40"
            >
              <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-emerald-500/10 blur-[80px]" />
              </div>

              <div className="relative flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-emerald-300">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                      Validator
                    </p>
                    <p className="font-mono text-sm text-zinc-200">
                      {item.delegation.validator_address.slice(0, 12)}...
                      {item.delegation.validator_address.slice(-8)}
                    </p>
                  </div>
                </div>
                <ArrowUpRight className="h-4 w-4 text-zinc-600 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-emerald-400" />
              </div>

              <div className="relative mt-6 grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    <Coins className="h-3 w-3" /> Shares
                  </div>
                  <p className="mt-1 text-lg font-semibold text-white">
                    {formatZigAmount(item.delegation.shares)} ZIG
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Balance
                  </div>
                  <div className="mt-1 flex items-baseline gap-1">
                    <p className="text-lg font-semibold text-emerald-300">
                      {formatZigAmount(item.balance.amount)}
                    </p>
                    <span className="text-[10px] text-zinc-500">ZIG</span>
                  </div>
                </div>
              </div>

              <div className="relative mt-4 flex items-center justify-between border-t border-white/10 pt-4">
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">
                    Delegator
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    {item.delegation.delegator_address.slice(0, 8)}...
                    {item.delegation.delegator_address.slice(-6)}
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-widest text-zinc-400">
                  Active
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
