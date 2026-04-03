"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";

const backgroundGradient = `linear-gradient(120deg,#14624F 0%,#39C8A6 36.7%,#FA4E30 66.8%,#2D1B45 100%)`;

export default function SiteMotion({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const contentEl = contentRef.current;
    if (!container || !contentEl) return;

    const ctx = gsap.context(() => {
      const elements = Array.from(contentEl.children) as HTMLElement[];
      gsap.fromTo(
        elements,
        { opacity: 0, y: 18 },
        {
          opacity: 1,
          y: 0,
          duration: 0.7,
          ease: "power2.out",
          stagger: 0.08,
        }
      );
    }, container);

    const handleMouseMove = (event: MouseEvent) => {
      if (!bgRef.current) return;
      const { clientX, clientY } = event;
      const moveX = (clientX - window.innerWidth / 2) * 0.008;
      const moveY = (clientY - window.innerHeight / 2) * 0.008;

      if (rafRef.current) return;
      rafRef.current = window.requestAnimationFrame(() => {
        gsap.to(bgRef.current, {
          x: moveX,
          y: moveY,
          duration: 1.8,
          ease: "power2.out",
        });
        rafRef.current = null;
      });
    };

    window.addEventListener("pointermove", handleMouseMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", handleMouseMove);
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
      ctx.revert();
    };
  }, []);

  return (
    <div ref={containerRef} className="relative flex min-h-screen flex-col bg-black overflow-hidden">
      <div
        ref={bgRef}
        className="absolute inset-0 z-1 h-96 scale-110"
        style={{
          backgroundImage: backgroundGradient,
          backgroundSize: "cover",
          backgroundRepeat: "no-repeat",
        }}
      >
        <div className="absolute inset-0 opacity-30 mix-blend-overlay pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 h-60 bg-gradient-to-b from-transparent to-black" />
      </div>
      <div className="relative z-10 w-full">
        <div ref={contentRef} className="relative z-10">
          {children}
        </div>
      </div>
    </div>
  );
}
