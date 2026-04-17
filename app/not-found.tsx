'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import Link from 'next/link';
import { 
  Zap, Search, Flame, AreaChart, Users, Wallet, PieChart, User, 
  Lock, Monitor, Binary, ArrowRight, Activity, Radio, Cpu, Terminal
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export default function Custom404() {
  const containerRef = useRef<HTMLDivElement>(null);
  const lightRef = useRef<HTMLDivElement>(null);
  
  // 3D Tilt Effect
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  
  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [5, -5]), { stiffness: 300, damping: 30 });
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-5, 5]), { stiffness: 300, damping: 30 });

  // Glitch effect state
  const [glitch, setGlitch] = useState(false);

  useEffect(() => {
    const glitchInterval = setInterval(() => {
      if (Math.random() > 0.6) {
        setGlitch(true);
        setTimeout(() => setGlitch(false), 100);
      }
    }, 2500);
    return () => clearInterval(glitchInterval);
  }, []);

  useEffect(() => {
    function onMove(e: MouseEvent | TouchEvent) {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      
      if (!containerRef.current) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      mouseX.set((clientX - centerX) / rect.width);
      mouseY.set((clientY - centerY) / rect.height);

      if (lightRef.current) {
        lightRef.current.animate({
          left: `${clientX}px`,
          top: `${clientY}px`
        }, { duration: 800, fill: "forwards", easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
      }
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onMove);
    };
  }, [mouseX, mouseY]);

  return (
    <div 
      ref={containerRef}
      className="min-h-screen text-white relative overflow-hidden font-mono selection:bg-[#39C8A6]/30 flex items-center justify-center perspective-1000"
    >
      {/* TERMINAL THEME BACKGROUND */}
      <div className="absolute inset-0 z-0">
        {/* Base Gradient */}
        <div
          className="absolute inset-0"
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
            filter: "saturate(120%) contrast(110%) brightness(0.8)",
          }}
        />
        
        {/* Vignette Overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.6) 70%, rgba(0,0,0,0.95) 100%), radial-gradient(120% 120% at 50% 0%, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.6) 70%, rgba(0,0,0,0.9) 100%)",
            mixBlendMode: "multiply",
          }}
        />
        
        {/* Noise/Grain Overlay */}
        <div
          className="absolute inset-0 opacity-30 mix-blend-overlay pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgdmlld0JveD0iMCAwIDEyOCAxMjgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGZpbHRlciBpZD0ibm9pc2UiIHg9IjAlIiB5PSIwJSIgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSI+PGZlVHVyYnVsZW5jZSB0eXBlPSJmcmFjdGFsTm9pc2UiIGJhc2VGcmVxdWVuY3k9IjAuOTgiIG51bU9jdGF2ZXM9IjUiIHN0aXRjaFRpbGVzPSJzdGl0Y2giLz48L2ZpbHRlcj48cmVjdCB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgZmlsdGVyPSJ1cmwoI25vaXNlKSIvPjwvc3ZnPg==")`,
            backgroundRepeat: "repeat",
            backgroundSize: "96px 96px",
            filter: "contrast(150%)",
          }}
        />
      </div>

      {/* Dynamic Spotlight - Cyan/Green tint */}
      <div 
        ref={lightRef}
        className="fixed w-[600px] h-[600px] rounded-full pointer-events-none z-10 mix-blend-screen opacity-50"
        style={{
          background: 'radial-gradient(circle, rgba(57, 200, 166, 0.4) 0%, rgba(20, 98, 79, 0.1) 40%, transparent 70%)',
          transform: 'translate(-50%, -50%)',
          filter: 'blur(40px)'
        }}
      />

      {/* Floating Particles - Terminal Green */}
      {[...Array(15)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 bg-[#39C8A6]/80 rounded-full z-0"
          initial={{ 
            x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 1000), 
            y: Math.random() * (typeof window !== 'undefined' ? window.innerHeight : 1000) 
          }}
          animate={{ 
            y: [null, -100],
            opacity: [0, 1, 0]
          }}
          transition={{ 
            duration: Math.random() * 4 + 4, 
            repeat: Infinity, 
            delay: Math.random() * 4 
          }}
        />
      ))}

      {/* 3D Main Container */}
      <motion.div 
        style={{ rotateX, rotateY }}
        className="relative z-20 w-full max-w-5xl mx-auto px-4"
      >
        {/* Glassmorphic Frame */}
        <div className="relative p-[1px] rounded-2xl bg-gradient-to-b from-white/30 via-white/10 to-transparent backdrop-blur-sm">
          <div className="bg-black/60 rounded-2xl p-8 md:p-12 border border-white/20 relative overflow-hidden shadow-2xl">
            
            {/* Terminal Scanline */}
            <motion.div 
              className="absolute inset-0 bg-gradient-to-b from-transparent via-[#39C8A6]/10 to-transparent h-24 w-full pointer-events-none z-30"
              animate={{ top: ['-10%', '110%'] }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            />

            {/* Corner Accents - Terminal Style */}
            <div className="absolute top-0 left-0 w-16 h-16 border-l-2 border-t-2 border-[#39C8A6]/60 rounded-tl-lg" />
            <div className="absolute top-0 right-0 w-16 h-16 border-r-2 border-t-2 border-[#FA4E30]/60 rounded-tr-lg" />
            <div className="absolute bottom-0 left-0 w-16 h-16 border-l-2 border-b-2 border-[#FA4E30]/60 rounded-bl-lg" />
            <div className="absolute bottom-0 right-0 w-16 h-16 border-r-2 border-b-2 border-[#39C8A6]/60 rounded-br-lg" />

            {/* Header Bar */}
            <div className="flex items-center justify-between mb-8 border-b border-white/10 pb-4">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-[#39C8A6]" />
                <span className="text-xs font-bold tracking-widest text-[#39C8A6]">Degen_Terminal Beta</span>
              </div>
              {/* <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-[#FA4E30]/80" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <div className="w-3 h-3 rounded-full bg-[#14624F]/80" />
              </div> */}
            </div>

            {/* Content */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-center">
              
              {/* Left Stats */}
              <div className="space-y-4 hidden lg:block">
                <TerminalStat label="BLOCK_HEIGHT" value="18,492,301" color="#39C8A6" delay={0.1} />
                <TerminalStat label="GAS_PRICE" value="24 uzig" color="#FA4E30" delay={0.2} />
                <TerminalStat label="PEERS" value="1,024" color="#14624F" delay={0.3} />
              </div>

              {/* Center 404 */}
              <div className="text-center relative py-8">
                <div className="relative">
                  {/* Glitch Text */}
                  <motion.h1 
                    className={`text-[7rem] md:text-[10rem] font-black leading-none tracking-tighter select-none relative z-10 font-mono
                      ${glitch ? 'text-[#FA4E30]' : 'text-white'}`}
                    style={{ 
                      textShadow: glitch 
                        ? '4px 0 #39C8A6, -4px 0 #FA4E30' 
                        : '0 0 40px rgba(57, 200, 166, 0.6)' 
                    }}
                    animate={glitch ? { x: [-3, 3, -3, 0], skewX: [-10, 10, 0] } : {}}
                    transition={{ duration: 0.1 }}
                  >
                    404
                  </motion.h1>
                  
                  {/* Status Badge */}
                  {/* <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.5, type: "spring" }}
                    className="absolute -top-2 -right-2 md:top-4 md:right-4"
                  >
                    <div className="px-3 py-1 bg-[#FA4E30]/90 text-black text-xs font-black rounded border border-[#FA4E30] animate-pulse">
                      ERROR
                    </div>
                  </motion.div> */}
                </div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  className="mt-6 space-y-4"
                >
                  {/* <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-black/50 border border-[#39C8A6]/30">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#FA4E30] animate-pulse" />
                    <span className="text-[10px] text-[#39C8A6] uppercase tracking-widest">Connection Lost</span>
                  </div> */}
                  
                  <h2 className="text-xl md:text-2xl font-bold text-white/90 font-mono tracking-tight">
                    PAGE NOT FOUND
                  </h2>
                  <p className="text-white text-xs max-w-xs mx-auto font-mono leading-relaxed">
                    {/* {'>'} The requested resource could not be located on this server.<br/>
                    {'>'} Please check the URL or return to base. */}
                    Looks like you’re lost — the page you’re looking for isn’t available!
                  </p>

                  <motion.div
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="mt-6 inline-block"
                  >
                    <Link 
                      href="/"
                      className="group relative inline-flex items-center gap-2 px-6 py-3 bg-[#14624F] hover:bg-[#1a7a61] text-white rounded border border-[#39C8A6]/50 transition-all font-mono text-sm tracking-wide overflow-hidden"
                    >
                      <span className="relative z-10">{'>'} Back to Home</span>
                      <ArrowRight className="relative z-10 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      <div className="absolute inset-0 bg-gradient-to-r from-[#39C8A6]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  </motion.div>
                </motion.div>
              </div>

              {/* Right Stats */}
              <div className="space-y-4 hidden lg:block">
                <TerminalStat label="UPTIME" value="99.97%" color="#39C8A6" delay={0.4} />
                <TerminalStat label="LATENCY" value="12ms" color="#FA4E30" delay={0.5} />
                <TerminalStat label="MEMORY" value="64TB" color="#14624F" delay={0.6} />
              </div>
            </div>

            {/* Footer Command Line */}
            {/* <div className="mt-8 pt-4 border-t border-white/10 flex items-center gap-2 text-xs font-mono text-[#39C8A6]/60">
              <span className="text-[#FA4E30]">root@terminal</span>
              <span>:</span>
              <span className="text-[#14624F]">~</span>
              <span>$</span>
              <motion.span 
                animate={{ opacity: [0, 1, 0] }}
                transition={{ duration: 1, repeat: Infinity }}
                className="w-2 h-4 bg-[#39C8A6] ml-1"
              />
            </div> */}
          </div>
        </div>
      </motion.div>

      {/* Floating Elements */}
      <FloatingElement icon="🐋" x="8%" y="15%" delay={0} />
      <FloatingElement icon="🦈" x="88%" y="20%" delay={1} />
      <FloatingElement icon="🦐" x="12%" y="80%" delay={2} />
      <FloatingElement icon="🐬" x="88%" y="80%" delay={2} />

    </div>
  );
}

// Terminal Stat Component
function TerminalStat({ label, value, color, delay }: any) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.5 }}
      className="p-3 rounded bg-black/40 border border-white/10 backdrop-blur-sm"
    >
      <div className="flex items-center justify-between gap-4">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</span>
        <div className="h-px flex-1 bg-white/10" />
        <span className="text-sm font-bold font-mono" style={{ color }}>{value}</span>
      </div>
      {/* Progress bar */}
      <div className="mt-2 h-1 bg-white/10 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${Math.random() * 40 + 60}%` }}
          transition={{ delay: delay + 0.3, duration: 1 }}
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>
    </motion.div>
  );
}

// Floating Element
function FloatingElement({ icon, x, y, delay }: any) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 0.6, scale: 1 }}
      transition={{ delay, type: "spring" }}
      className="absolute pointer-events-none hidden md:block"
      style={{ left: x, top: y }}
    >
      <motion.div
        animate={{ y: [0, -20, 0], rotate: [0, 5, -5, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay }}
        className="text-7xl filter drop-shadow-[0_0_20px_rgba(57,200,166,0.4)]"
      >
        {icon}
      </motion.div>
    </motion.div>
  );
}