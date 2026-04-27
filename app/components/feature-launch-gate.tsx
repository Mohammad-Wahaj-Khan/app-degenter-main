"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Navbar from "./navbar";
import TopMarketToken from "./TopMarketToken";
import {
  getFeatureReleaseConfig,
  parseFeatureReleaseDate,
  type TimedFeatureKey,
} from "@/lib/feature-release";

type FeatureLaunchGateProps = {
  feature: TimedFeatureKey;
  children: ReactNode;
};

const countdownParts = [
  { key: "days", label: "Days", text: "text-[#f3df9a]" },
  { key: "hours", label: "Hours", text: "text-[#9cf3df]" },
  { key: "minutes", label: "Minutes", text: "text-[#ffc8bc]" },
  { key: "seconds", label: "Seconds", text: "text-white" },
] as const;

function formatCountdown(msRemaining: number) {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { days, hours, minutes, seconds };
}

function CountdownCell({
  label,
  value,
  text,
}: {
  label: string;
  value: number;
  text: string;
}) {
  const display = String(value).padStart(2, "0");

  return (
    <div className="min-w-0 text-center">
      <span
        key={display}
        className={`feature-countdown-digit block font-semibold leading-none tabular-nums ${text} text-[clamp(4rem,11vw,10rem)]`}
      >
        {display}
      </span>
      <span className="mt-3 block text-[0.68rem] uppercase text-white/42 sm:text-xs">
        {label}
      </span>
    </div>
  );
}

function LaunchScreen({
  feature,
  releaseAtMs,
  nowMs,
}: {
  feature: TimedFeatureKey;
  releaseAtMs: number;
  nowMs: number | null;
}) {
  const config = getFeatureReleaseConfig(feature);
  const msRemaining = Math.max(0, releaseAtMs - (nowMs ?? releaseAtMs));
  const { days, hours, minutes, seconds } = formatCountdown(msRemaining);
  const formattedRelease = new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(releaseAtMs);

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-black">
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
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(to bottom, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.65) 70%, rgba(0,0,0,0.9) 100%), radial-gradient(120% 120% at 50% 0%, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.45) 70%, rgba(0,0,0,0.75) 100%)",
            mixBlendMode: "multiply",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-40 mix-blend-overlay"
          style={{
            backgroundImage:
              'url("data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgdmlld0JveD0iMCAwIDEyOCAxMjgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGZpbHRlciBpZD0ibm9pc2UiIHg9IjAlIiB5PSIwJSIgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSI+PGZlVHVyYnVsZW5jZSB0eXBlPSJmcmFjdGFsTm9pc2UiIGJhc2VGcmVxdWVuY3k9IjAuOTgiIG51bU9jdGF2ZXM9IjUiIHN0aXRjaFRpbGVzPSJzdGl0Y2giLz48L2ZpbHRlcj48cmVjdCB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgZmlsdGVyPSJ1cmwoI25vaXNlKSIvPjwvc3ZnPg==")',
            backgroundRepeat: "repeat",
            backgroundSize: "96px 96px",
            filter: "contrast(120%)",
          }}
        />
        <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-b from-transparent to-black" />
      </div>

      <div className="relative z-20">
        <Navbar />
        <TopMarketToken />
      </div>

      <section className="relative z-10 flex flex-1 items-start justify-center px-5 pb-16 pt-20 sm:px-8 sm:pt-24 lg:px-12">
        <div className="w-full max-w-6xl text-center text-white">
          {/* <div className="mx-auto mb-5 inline-flex items-center rounded-full border border-[#6f5b2d] bg-[#0d0d0d]/70 px-4 py-2 text-xs font-semibold uppercase text-[#f3df9a]">
            Timed Release
          </div> */}

          <h1 className="mx-auto max-w-full text-[clamp(2.8rem,7vw,6.6rem)] font-semibold leading-[1.02] text-[#f7f1df]">
            {config.label} Launching Soon
          </h1>

          <p className="mx-auto mt-7 max-w-3xl text-base leading-8 text-white/70 sm:text-lg">
            This page is scheduled to go live on its own. The current layout,
            data flow, and design will appear automatically when the countdown
            reaches zero.
          </p>

          <p className="mt-5 text-sm font-medium text-[#f3df9a]/85">
            Launch time: {formattedRelease}
          </p>

          <div className="mx-auto mt-12 grid w-full max-w-5xl min-w-0 grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-4 sm:gap-x-8 lg:mt-16">
            {countdownParts.map((part) => {
              const valueMap = { days, hours, minutes, seconds };

              return (
                <CountdownCell
                  key={`${part.key}-${valueMap[part.key]}`}
                  label={part.label}
                  value={valueMap[part.key]}
                  text={part.text}
                />
              );
            })}
          </div>

          <div className="mx-auto mt-10 h-px max-w-2xl bg-gradient-to-r from-transparent via-[#d4af37]/35 to-transparent" />
        </div>
      </section>
    </main>
  );
}

export default function FeatureLaunchGate({
  feature,
  children,
}: FeatureLaunchGateProps) {
  const config = getFeatureReleaseConfig(feature);
  const releaseAtMs = useMemo(
    () => parseFeatureReleaseDate(config.releaseAt),
    [config.releaseAt]
  );
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    if (!releaseAtMs) return;

    setNowMs(Date.now());
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [releaseAtMs]);

  if (!releaseAtMs) return <>{children}</>;
  if (nowMs !== null && nowMs >= releaseAtMs) return <>{children}</>;

  return <LaunchScreen feature={feature} releaseAtMs={releaseAtMs} nowMs={nowMs} />;
}
