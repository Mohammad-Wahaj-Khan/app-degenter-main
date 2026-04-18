"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useChain } from '@cosmos-kit/react';
import { useRouter } from 'next/navigation';
import { Search, Wallet, AlertTriangle, TrendingUp, ChevronDown, Copy, Check, ShieldAlert } from 'lucide-react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import TopMarketToken from '../components/TopMarketToken';
import Navbar from '../components/navbar';

gsap.registerPlugin(ScrollTrigger);

interface WalletData {
  id: string;
  address: string;
  balance: string;
  allTimePnl: string;
  pnl90d: string;
  volume90d: string;
  winRate: string;
  age: string;
  winRateColor: string;
}

export default function WalletTracker() {
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const router = useRouter();
  const { address, connect, openView, status } = useChain('zigchain-1');
  const isConnecting = status === 'Connecting';
  const isConnected = Boolean(address);
  
  // Refs for GSAP
  const containerRef = useRef(null);
  const titleRef = useRef(null);
  const subtitleRef = useRef(null);
  const searchRef = useRef(null);
  const betaRef = useRef(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Globe Animation Effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let time = 0;

    const resize = () => {
      const targetWidth = Math.min(window.innerWidth, 1100);
      const targetHeight = Math.min(window.innerHeight * 0.6, 520);
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      canvas.style.width = `${targetWidth}px`;
      canvas.style.height = `${targetHeight}px`;
    };
    resize();
    window.addEventListener('resize', resize);

    // Globe parameters
    const globeRadius = Math.min(canvas.width, canvas.height) * 0.36;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    
    // Generate sphere points
    const latitudes = 12;
    const longitudes = 24;
    const points: { x: number; y: number; z: number; lat: number; lon: number }[] = [];
    
    for (let lat = 0; lat <= latitudes; lat++) {
      for (let lon = 0; lon < longitudes; lon++) {
        const phi = (Math.PI * lat) / latitudes;
        const theta = (2 * Math.PI * lon) / longitudes;
        points.push({
          x: Math.sin(phi) * Math.cos(theta),
          y: Math.cos(phi),
          z: Math.sin(phi) * Math.sin(theta),
          lat,
          lon
        });
      }
    }

    const animate = () => {
      time += 0.002;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Rotate points
      const rotatedPoints = points.map(p => {
        const cosY = Math.cos(time);
        const sinY = Math.sin(time);
        const x = p.x * cosY - p.z * sinY;
        const z = p.x * sinY + p.z * cosY;
        
        // Project to 2D
        const scale = globeRadius / (2 + z);
        return {
          x: centerX + x * globeRadius,
          y: centerY + p.y * globeRadius * 0.9,
          z: z,
          scale: scale,
          original: p
        };
      });

      // Draw connections (network lines)
      ctx.strokeStyle = 'rgba(20, 184, 166, 0.15)';
      ctx.lineWidth = 0.5;
      
      for (let i = 0; i < rotatedPoints.length; i++) {
        for (let j = i + 1; j < rotatedPoints.length; j++) {
          const p1 = rotatedPoints[i];
          const p2 = rotatedPoints[j];
          const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
          
          if (dist < globeRadius * 0.25 && p1.z > -0.5 && p2.z > -0.5) {
            const alpha = (1 - dist / (globeRadius * 0.25)) * 0.3 * (p1.z + 1) * 0.5;
            ctx.strokeStyle = `rgba(45, 212, 191, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }
      }

      // Draw latitude lines
      for (let lat = 1; lat < latitudes; lat++) {
        ctx.strokeStyle = `rgba(20, 184, 166, ${0.1 + lat * 0.02})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        
        for (let lon = 0; lon <= longitudes; lon++) {
          const idx = lat * longitudes + (lon % longitudes);
          const p = rotatedPoints[idx];
          if (p.z > -0.3) {
            if (lon === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          }
        }
        ctx.stroke();
      }

      // Draw longitude lines
      for (let lon = 0; lon < longitudes; lon += 2) {
        ctx.strokeStyle = 'rgba(20, 184, 166, 0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        
        for (let lat = 0; lat <= latitudes; lat++) {
          const idx = lat * longitudes + lon;
          const p = rotatedPoints[idx];
          if (p.z > -0.3) {
            if (lat === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          }
        }
        ctx.stroke();
      }

      // Draw glowing points
      rotatedPoints.forEach((p, i) => {
        if (p.z > -0.5) {
          const size = (1 + p.z) * 1.5;
          const alpha = (0.3 + p.z * 0.4);
          
          // Glow
          const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 4);
          gradient.addColorStop(0, `rgba(45, 212, 191, ${alpha * 0.8})`);
          gradient.addColorStop(0.5, `rgba(20, 184, 166, ${alpha * 0.3})`);
          gradient.addColorStop(1, 'rgba(20, 184, 166, 0)');
          
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(p.x, p.y, size * 4, 0, Math.PI * 2);
          ctx.fill();
          
          // Core
          ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, size * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // Outer glow ring
      const glowGradient = ctx.createRadialGradient(centerX, centerY, globeRadius * 0.8, centerX, centerY, globeRadius * 1.3);
      glowGradient.addColorStop(0, 'rgba(20, 184, 166, 0)');
      glowGradient.addColorStop(0.5, 'rgba(20, 184, 166, 0.05)');
      glowGradient.addColorStop(1, 'rgba(20, 184, 166, 0)');
      
      ctx.fillStyle = glowGradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, globeRadius * 1.3, 0, Math.PI * 2);
      ctx.fill();

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // 1. Initial entrance animation
      const tl = gsap.timeline({ defaults: { ease: "power4.out" } });
      
      tl.fromTo(titleRef.current, 
        { y: 60, opacity: 0 }, 
        { y: 0, opacity: 1, duration: 1.2, delay: 0.2 }
      )
      .fromTo(subtitleRef.current, 
        { y: 30, opacity: 0 }, 
        { y: 0, opacity: 1, duration: 1 }, "-=0.8"
      )
      .fromTo(searchRef.current, 
        { scale: 0.95, opacity: 0 }, 
        { scale: 1, opacity: 1, duration: 1, ease: "back.out(1.7)" }, "-=0.6"
      )
      .fromTo(betaRef.current, 
        { y: 20, opacity: 0 }, 
        { y: 0, opacity: 1, duration: 0.8 }, "-=0.4"
      );

      // 2. Continuous floating animation for Search Bar
      gsap.to(searchRef.current, {
        y: -10,
        duration: 2,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut"
      });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  const handleCopy = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const handleConnect = async () => {
    if (isConnected) return;

    if (openView) {
      openView();
      return;
    }

    if (connect) {
      await connect();
    }
  };

  const handleSearchSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;
    router.push(`/portfolio?address=${encodeURIComponent(query)}`);
  };

  return (
    <main className="flex min-h-screen flex-col  relative overflow-hidden" ref={containerRef}>

      {/* Holographic Globe Background - Behind main content */}
      <canvas
        ref={canvasRef}
        className="fixed left-1/2 z-0 pointer-events-none -translate-x-1/2"
        style={{
          top: "300px",
          width: "min(100%, 1100px)",
          height: "520px",
          background: 'radial-gradient(ellipse at center, rgba(10,10,10,0.9) 0%, rgba(0,0,0,0.95) 70%)',
          filter: "drop-shadow(0 30px 60px rgba(0,0,0,0.7)) brightness(0.58) saturate(0.75)",
        }}
      />
      
      {/* Vignette overlay for depth */}
      <div className="fixed inset-0 z-[1] pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.4) 70%, rgba(0,0,0,0.8) 100%)'
        }}
      />

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

      {/* Navigation */}
        <div className="z-10">
          <Navbar />
          <TopMarketToken />
        </div>
      {/* Main Content - Above globe */}
      <div className="relative min-h-screen text-white font-sans selection:bg-[#10b981]/30 selection:text-[#10b981] overflow-x-hidden">
        <div className="py-20 md:py-24 px-4 sm:px-6">
          <div className="text-center space-y-10">
            
            <h1 ref={titleRef} className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1] text-balance drop-shadow-2xl">
              Track the best Wallets to{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#064e3b] via-[#34d399] to-[#064e3b] animate-gradient">
                Discover PNL
              </span>
              <br className="hidden md:block" />
              <span className="text-white/90"> & Highlighted Trades.</span>
            </h1>
            
            <p ref={subtitleRef} className="text-lg md:text-xl text-white/50 font-medium max-w-2xl mx-auto">
              Built Exclusively For Degen Traders
              <span className="block mt-2 text-sm text-[#10b981]/60 font-mono tracking-widest uppercase">Real-Time On-Chain Intelligence</span>
            </p>

            {/* Search Section */}
            <div ref={searchRef} className="max-w-2xl mx-auto w-full group">
              <form onSubmit={handleSearchSubmit} className="relative">
                {/* Emerald Glow */}
                <div className="absolute -inset-[2px] bg-gradient-to-r from-[#064e3b] via-[#10b981] to-[#064e3b] animate-gradient rounded-2xl opacity-20 group-hover:opacity-60 blur-xl transition duration-500"></div>
                
                <div className="relative flex items-center bg-black/60 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl transition-all duration-300 group-focus-within:border-[#10b981]/50">
                  <Search className="absolute left-5 w-5 h-5 text-white/30" />
                  <input
                    type="text"
                    placeholder="Enter Wallet Address (zig1...)"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-transparent px-14 py-6 text-white placeholder-white/20 focus:outline-none text-lg"
                  />
                  <button
                    type="submit"
                    className="absolute right-4 px-6 py-2 text-sm font-bold text-black bg-[#10b981] rounded-xl hover:bg-[#34d399] transition-colors shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                  >
                    ANALYZE
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* Beta Notice Section */}
        <div ref={betaRef} className="max-w-5xl mx-auto px-4 sm:px-6 mb-20">
          <div className="rounded-3xl p-8 backdrop-blur-xl bg-black/40 border border-white/5 transition-colors duration-500">
            <div className="flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
              <div className="flex-shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center">
                <AlertTriangle className="w-12 h-12 text-yellow-500"/>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-black text-white/90 mb-2">
                   Beta Notice
                </h3>
                <p className="text-white/80 text-md md:text-base leading-relaxed">
                  Our wallet analyzer currently evaluates wallets based on <strong className='bg-[#10b981]/30 text-[#10b981]'>Trade event count only</strong>. 
                  Transfer events (send/receive of tokens) are not yet factored into the analysis. Rankings and scores may not reflect full wallet activity.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes gradient {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .animate-gradient {
          background-size: 200% 200%;
          animation: gradient 4s ease infinite;
        }
      `}</style>
    </main>
  );
}
