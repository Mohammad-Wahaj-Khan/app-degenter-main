"use client";
import { useEffect, useState, useRef, type ReactNode } from "react";
import Navbar from "./navbar";
import TopMarketToken from "./TopMarketToken";
import { gsap } from "gsap";
import {
  getFeatureReleaseConfig,
  type TimedFeatureKey,
} from "@/lib/feature-release";

type FeatureLaunchGateProps = {
  feature: TimedFeatureKey;
  children: ReactNode;
};

const countdownParts = [
  { key: "days", label: "Days", accent: "#57F3BB", glow: "rgba(87, 243, 187, 0.18)" },
  { key: "hours", label: "Hours", accent: "#FFFFFF", glow: "rgba(255, 255, 255, 0.16)" },
  { key: "minutes", label: "Minutes", accent: "#FA4E30", glow: "rgba(250, 78, 48, 0.18)" },
  { key: "seconds", label: "Seconds", accent: "#C7B2FF", glow: "rgba(199, 178, 255, 0.18)" },
] as const;

function formatCountdown(msRemaining: number) {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds };
}

function CountdownCell({ label, value, accent, glow }: any) {
  const display = String(value).padStart(2, "0");
  const cellRef = useRef(null);

  return (
    <div 
      ref={cellRef}
      className="feature-timer-panel pointer-events-none relative select-none overflow-hidden rounded-[2.5rem] border border-white/10 bg-white/[0.04] px-4 py-10 backdrop-blur-[20px]"
      style={{ boxShadow: `0 30px 80px rgba(0,0,0,0.4), 0 0 40px ${glow}` }}
      onContextMenu={(event) => event.preventDefault()}
      onCopy={(event) => event.preventDefault()}
      onCut={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
    >
      {/* Animated Top Beam */}
      <div className="absolute inset-x-8 top-0 h-[2px] opacity-70"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} 
      />
      
      {/* Internal Floating Glow */}
      <div className="pointer-events-none absolute -right-4 -top-4 h-24 w-24 rounded-full blur-3xl opacity-20"
        style={{ backgroundColor: accent }} 
      />

      <span className="block select-none font-bold leading-none tabular-nums text-white text-[clamp(3.5rem,10vw,8rem)] tracking-tighter"
        style={{ textShadow: `0 0 30px ${glow}` }}>
        {display}
      </span>
      
      <div className="mt-6 flex items-center justify-center gap-3">
        <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: accent, boxShadow: `0 0 10px ${accent}` }} />
        <span className="select-none text-[0.7rem] uppercase tracking-[0.3em] text-white/60 font-medium">
          {label}
        </span>
      </div>
    </div>
  );
}

function LaunchScreen({ feature, releaseAtMs, nowMs }: any) {
  const config = getFeatureReleaseConfig(feature);
  const containerRef = useRef(null);
  const msRemaining = releaseAtMs ? Math.max(0, releaseAtMs - (nowMs ?? 0)) : 0;
  const { days, hours, minutes, seconds } = formatCountdown(msRemaining);
  const estimatedLaunch = releaseAtMs
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(releaseAtMs)
    : "...";

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline();
      tl.from(".animate-in", { 
        y: 30, 
        opacity: 0, 
        stagger: 0.15, 
        duration: 1, 
        ease: "power4.out" 
      });
      
      // Floating animation for the whole shell
      gsap.to(".floating-shell", {
        y: -15,
        duration: 3,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut"
      });
    }, containerRef);
    return () => ctx.revert();
  }, []);

  return (
    <main ref={containerRef} className="relative flex min-h-screen flex-col overflow-hidden bg-black">
      {/* ORIGINAL THEME BACKGROUND (Keeping your requested style) */}
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

      <div className="relative z-20">
        <Navbar />
        <TopMarketToken />
      </div>

      <section className="relative z-10 flex flex-1 items-center justify-center px-5 py-20">
        <div
          className="floating-shell relative w-full max-w-7xl select-none rounded-[3rem] border border-white/10 bg-white/[0.02] p-8 text-center backdrop-blur-3xl sm:p-16"
          onContextMenu={(event) => event.preventDefault()}
          onCopy={(event) => event.preventDefault()}
          onCut={(event) => event.preventDefault()}
          onDragStart={(event) => event.preventDefault()}
        >
          
          {/* Top accent line */}
          <div className="absolute inset-x-20 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />

          <h1 className="animate-in text-[clamp(2.5rem,6vw,5rem)] font-bold tracking-tight text-white leading-none">
            {config.label} <span className="opacity-50 font-light">is almost here.</span>
          </h1>

          {/* <p className="animate-in mx-auto mt-6 max-w-2xl text-lg text-white/50 leading-relaxed">
            We are preparing the final blocks. The dashboard will unlock automatically when the timer hits zero.
          </p> */}

          <div className="animate-in pointer-events-none mt-12 grid select-none grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6">
            {countdownParts.map((part) => (
              <CountdownCell
                key={part.key}
                label={part.label}
                value={{ days, hours, minutes, seconds }[part.key]}
                accent={part.accent}
                glow={part.glow}
              />
            ))}
          </div>

          <div className="animate-in mt-12 inline-flex items-center gap-3 rounded-full border border-white/5 bg-black/40 px-6 py-2.5 text-sm text-white/60">
            <span className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
            Estimated Launch: <span className="text-white font-medium">{estimatedLaunch}</span>
          </div>
        </div>
      </section>
    </main>
  );
}

// ... Rest of the FeatureLaunchGate export remains same as your original logic
export default function FeatureLaunchGate({ feature, children }: FeatureLaunchGateProps) {
    const [releaseAtMs, setReleaseAtMs] = useState<number | null>(null);
    const [isReleased, setIsReleased] = useState(false);
    const [hasCheckedRelease, setHasCheckedRelease] = useState(false);
    const [serverTimeOffsetMs, setServerTimeOffsetMs] = useState(0);
    const [nowMs, setNowMs] = useState<number | null>(null);
    useEffect(() => {
      let active = true;
      const loadReleaseState = async () => {
        let nextNowMs = Date.now();
        try {
          const response = await fetch(`/api/feature-release?feature=${encodeURIComponent(feature)}`, { cache: "no-store" });
          const data = await response.json();
          if (!active) return;
          const serverNowMs =
            typeof data.serverNowMs === "number" ? data.serverNowMs : Date.now();
          const offsetMs = serverNowMs - Date.now();
          nextNowMs = serverNowMs;

          setServerTimeOffsetMs(offsetMs);
          setReleaseAtMs(
            typeof data.releaseAtMs === "number" ? data.releaseAtMs : null
          );
          setIsReleased(Boolean(data.released));
        } catch {
          setIsReleased(false);
        } finally {
          if (active) {
            setNowMs(nextNowMs);
            setHasCheckedRelease(true);
          }
        }
      };
      void loadReleaseState();
      return () => { active = false; };
    }, [feature]);
    useEffect(() => {
      if (!releaseAtMs) return;
      const intervalId = window.setInterval(
        () => setNowMs(Date.now() + serverTimeOffsetMs),
        1000
      );
      return () => window.clearInterval(intervalId);
    }, [releaseAtMs, serverTimeOffsetMs]);
    if (!hasCheckedRelease) return <main className="min-h-screen bg-black" />;
    if (isReleased || (releaseAtMs && nowMs !== null && nowMs >= releaseAtMs)) return <>{children}</>;
    return <LaunchScreen feature={feature} releaseAtMs={releaseAtMs} nowMs={nowMs} />;
}
