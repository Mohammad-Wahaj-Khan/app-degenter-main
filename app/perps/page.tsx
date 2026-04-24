"use client";

import React, { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import { API_BASE_URL, API_HEADERS } from '@/lib/api';
import { applyPageMetadata } from '@/lib/page-metadata';
import { 
  Search, 
  Wallet, 
  Bell, 
  Settings, 
  ChevronDown, 
  TrendingUp, 
  TrendingDown, 
  Activity,
  Zap,
  Menu,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  Cell 
} from 'recharts';
import TopMarketToken from '../components/TopMarketToken';
import Navbar from '../components/navbar';

// --- Types & Interfaces ---

interface HeatmapCell {
  id: string;
  value: number; // -1 to 1 (red to green)
  asset: string;
  time: string;
}

interface DistributionData {
  range: string;
  label: string;
  long: number;
  short: number;
  total: number;
}

// --- Mock Data Generators ---

const DEFAULT_ASSETS = ['BTC', 'ETH', 'HYPE', 'SOL', 'SUI', 'APT', 'DOGE', 'XRP', 'LINK', 'ARB', 'OP', 'PEPE', 'WLD', 'TRUMP', 'WIF', 'BONK'];
const TIME_SLOTS = Array.from({ length: 24 }, (_, i) => `${i}:00`);

const generateHeatmapData = (assets: string[]): HeatmapCell[] => {
  const data: HeatmapCell[] = [];
  assets.forEach(asset => {
    TIME_SLOTS.forEach(time => {
      // Bias towards green slightly for "bullish" demo feel, but random
      const val = Math.random() * 2 - 0.8; 
      data.push({
        id: `${asset}-${time}`,
        value: val,
        asset,
        time
      });
    });
  });
  return data;
};

const DISTRIBUTION_DATA: DistributionData[] = [
  { range: '$1M to ∞', label: 'Money Printer', long: 85, short: 15, total: 120 },
  { range: '$100K to $1M', label: 'Smart Money', long: 65, short: 35, total: 450 },
  { range: '$10K to $100K', label: 'Gambler', long: 45, short: 55, total: 1200 },
  { range: '$1K to $10K', label: 'Humble Gamer', long: 60, short: 40, total: 3500 },
  { range: '$0 to $1K', label: 'Exit Liquidity', long: 30, short: 70, total: 8900 },
  { range: '-$1K to $0', label: 'Rookie', long: 20, short: 80, total: 5600 },
  { range: '-$10K to -$1K', label: 'Semi-Rekt', long: 10, short: 90, total: 1200 },
  { range: '-$100K to -$10K', label: 'Full-Rekt', long: 5, short: 95, total: 300 },
  { range: '-$1M to -$100K', label: 'Liquidated', long: 2, short: 98, total: 50 },
];

// --- Components ---

const Header = () => (
  <motion.header 
    initial={{ y: -20, opacity: 0 }}
    animate={{ y: 0, opacity: 1 }}
    className="flex items-center justify-between px-6 py-4 backdrop-blur-md border-b border-white/5 sticky top-0 z-50"
  >
    <div className="flex items-center gap-8">
      <div className="flex items-center gap-2 text-white font-bold text-xl tracking-tight">
        <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <Zap className="w-5 h-5 text-white fill-current" />
        </div>
        <span>Degenter</span>
      </div>
      
      <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-400">
        {['Trade', 'Vaults', 'Leaderboard', 'Rewards', 'More'].map((item) => (
          <a key={item} href="#" className="hover:text-white transition-colors">
            {item}
          </a>
        ))}
      </nav>
    </div>

    <div className="flex items-center gap-4">
      <div className="relative hidden sm:block">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input 
          type="text" 
          placeholder="Search wallet address" 
          className="bg-[#151520] border border-white/10 rounded-full py-2 pl-10 pr-4 text-sm text-gray-300 focus:outline-none focus:border-indigo-500/50 w-64 transition-all"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-600 border border-gray-700 rounded px-1.5 py-0.5">/</span>
      </div>
      
      <button className="p-2 text-gray-400 hover:text-white transition-colors">
        <Bell className="w-5 h-5" />
      </button>
      
      <button className="flex items-center gap-2 bg-[#151520] hover:bg-[#1c1c2e] border border-white/10 rounded-full px-4 py-2 text-sm font-medium text-white transition-all">
        <Wallet className="w-4 h-4" />
        <span className="hidden sm:inline">Connect</span>
      </button>
    </div>
  </motion.header>
);

const Sidebar = () => (
  <motion.aside 
    initial={{ x: -20, opacity: 0 }}
    animate={{ x: 0, opacity: 1 }}
    transition={{ delay: 0.1 }}
    className="hidden lg:flex flex-col w-16 border-r border-white/5 bg-[#0B0B14] items-center py-6 gap-6"
  >
    {[Activity, TrendingUp, BarChart, Wallet, Settings].map((Icon, i) => (
      <div 
        key={i} 
        className={`p-2 rounded-xl cursor-pointer transition-all ${i === 0 ? 'bg-indigo-500/10 text-indigo-400' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
      >
        <Icon className="w-5 h-5" />
      </div>
    ))}
  </motion.aside>
);

const HeatmapGrid = ({ data, assets }: { data: HeatmapCell[]; assets: string[] }) => {
  // Group data by asset for rendering rows
  const groupedData = useMemo(() => {
    const groups: Record<string, HeatmapCell[]> = {};
    data.forEach(cell => {
      if (!groups[cell.asset]) groups[cell.asset] = [];
      groups[cell.asset].push(cell);
    });
    return groups;
  }, [data]);

  const getColor = (val: number) => {
    if (val > 0.5) return 'bg-emerald-500';
    if (val > 0) return 'bg-emerald-500/60';
    if (val > -0.5) return 'bg-rose-500/60';
    return 'bg-rose-500';
  };

  return (
    <div className="w-full overflow-x-auto pb-2 custom-scrollbar">
      <div className="min-w-[800px]">
        {/* Header Row (Times) */}
        <div className="flex mb-2 pl-16">
          {TIME_SLOTS.map((time, i) => (
            <div key={time} className="flex-1 text-[10px] text-gray-500 text-center font-mono">
              {i % 4 === 0 ? time : ''}
            </div>
          ))}
        </div>

        {/* Grid Rows */}
        <div className="space-y-1">
          {assets.map((asset) => (
            <div key={asset} className="flex items-center gap-2 group">
              <div className="w-14 text-xs font-bold text-gray-400 group-hover:text-white transition-colors">
                {asset}
              </div>
              <div className="flex-1 flex gap-[2px]">
                {groupedData[asset]?.map((cell) => (
                  <motion.div
                    key={cell.id}
                    whileHover={{ scale: 1.4, zIndex: 10 }}
                    className={`flex-1 h-8 rounded-sm ${getColor(cell.value)} cursor-pointer relative`}
                  >
                    {/* Tooltip simulation on hover could go here, simplified for grid density */}
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const DistributionChart = () => {
  return (
    <div className="h-[400px] w-full mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={DISTRIBUTION_DATA}
          layout="vertical"
          margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
          barSize={20}
        >
          <XAxis type="number" hide />
          <YAxis 
            dataKey="range" 
            type="category" 
            tick={{ fill: '#9ca3af', fontSize: 10 }} 
            width={80}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip 
            cursor={{ fill: 'transparent' }}
            contentStyle={{ backgroundColor: '#151520', borderColor: '#333', color: '#fff' }}
            itemStyle={{ color: '#fff' }}
          />
          <Bar dataKey="long" stackId="a" fill="#10b981" radius={[0, 4, 4, 0]} />
          <Bar dataKey="short" stackId="a" fill="#f43f5e" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

// --- Main Page Component ---

export default function PerpsDegenterDashboard() {
  useEffect(() => {
    applyPageMetadata({
      pageName: "Perps",
      description: "Perps | Degenter.io",
    });
  }, []);

  const [heatmapData, setHeatmapData] = useState<HeatmapCell[]>([]);
  const [assets, setAssets] = useState<string[]>(DEFAULT_ASSETS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadAssets = async () => {
      try {
        if (!API_BASE_URL) throw new Error('API_BASE_URL not set');
        const r = await fetch(
          `${API_BASE_URL}/tokens/swap-list?bucket=24h&unit=usd`,
          { headers: API_HEADERS }
        );
        const j = await r.json();
        const list = Array.isArray(j?.data) ? j.data : [];
        const symbols = list
          .map((t: any) => t?.symbol)
          .filter((s: unknown): s is string => typeof s === 'string')
          .map((s: string) => s.trim())
          .filter((s: string | any[]) => s.length > 0);
        const unique = Array.from(new Set<string>(symbols));
        const nextAssets = unique.length ? unique.slice(0, 16) : DEFAULT_ASSETS;
        if (cancelled) return;
        setAssets(nextAssets);
        setHeatmapData(generateHeatmapData(nextAssets));
      } catch {
        if (cancelled) return;
        setAssets(DEFAULT_ASSETS);
        setHeatmapData(generateHeatmapData(DEFAULT_ASSETS));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    loadAssets();
    return () => {
      cancelled = true;
    };
  }, []);

  // Simulate live updates
  useEffect(() => {
    if (isLoading) return;
    const interval = setInterval(() => {
      setHeatmapData(prev => {
        const newData = [...prev];
        // Randomly update a few cells
        for(let i=0; i<10; i++) {
          const idx = Math.floor(Math.random() * newData.length);
          newData[idx] = { ...newData[idx], value: Math.random() * 2 - 0.8 };
        }
        return newData;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [isLoading]);

  return (
    <main className="flex min-h-screen flex-col bg-black relative overflow-hidden">
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
        <div className="z-10">
            <Navbar />
            <TopMarketToken />
        </div>

      {/* <div className="flex h-screen overflow-hidden"> */}
        {/* <Sidebar /> */}
        
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {/* Background Ambient Glow */}
          {/* <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
            <div className="absolute top-[-10%] left-[20%] w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[100px]" />
            <div className="absolute bottom-[-10%] right-[10%] w-[400px] h-[400px] bg-purple-600/10 rounded-full blur-[100px]" />
          </div> */}

          {/* <Header /> */}

          <main className="flex-1 overflow-y-auto p-4 md:p-8 ">
            <div className="max-w-8xl mx-auto space-y-8">
              
              {/* Hero Text */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-center space-y-4 mb-12"
              >
                <h1 className="text-3xl md:text-5xl font-bold tracking-tight">
                  Unlock real-time data and signals from <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#064e3b] via-[#34d399] to-[#064e3b] animate-gradient">perp traders</span>
                </h1>
                <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto">
                  Dive into <span className="text-white font-medium">cohort analytics</span> and <span className="text-white font-medium">token heat maps</span>. Stay tuned!
                </p>
              </motion.div>

              {/* Dashboard Container */}
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="border border-white/5 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-sm"
              >
                {/* Dashboard Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 ">
                  <div className="flex items-center gap-4">
                    <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Market Position Heatmap</h2>
                  </div>
                  {/* <div className="flex items-center gap-3">
                    <button className="px-3 py-1.5 text-xs font-medium bg-white/5 hover:bg-white/10 border border-white/10 rounded-md transition-colors">
                      Customize
                    </button>
                    <button className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-white/5 hover:bg-white/10 border border-white/10 rounded-md transition-colors">
                      Position Age: All <ChevronDown className="w-3 h-3" />
                    </button>
                  </div> */}
                </div>

                {/* Heatmap Section */}
                <div className="p-6">
                  {isLoading ? (
                    <div className="h-64 flex items-center justify-center">
                      <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : (
                    <HeatmapGrid data={heatmapData} assets={assets} />
                  )}
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 border-t border-white/5">
                  
                  {/* Position Distribution */}
                  <div className="p-6 border-b lg:border-b-0 lg:border-r border-white/5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Position Distribution by PnL</h3>
                    </div>
                    <div className="space-y-3">
                      {DISTRIBUTION_DATA.map((row, i) => (
                        <div key={i} className="group">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-gray-400 w-20">{row.range}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                row.label === 'Money Printer' ? 'bg-yellow-500/20 text-yellow-300' :
                                row.label === 'Smart Money' ? 'bg-indigo-500/20 text-indigo-300' :
                                'bg-gray-700/30 text-gray-400'
                              }`}>
                                {row.label}
                              </span>
                            </div>
                            <span className="text-gray-500">{row.total.toLocaleString()} Wallets</span>
                          </div>
                          <div className="h-2 w-full  rounded-full overflow-hidden flex">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${row.long}%` }}
                              transition={{ duration: 1, delay: i * 0.05 }}
                              className="h-full bg-emerald-500"
                            />
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${row.short}%` }}
                              transition={{ duration: 1, delay: i * 0.05 }}
                              className="h-full bg-rose-500"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Equity Distribution (Visual Placeholder matching image) */}
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Position Distribution by Equity</h3>
                    </div>
                    <div className="relative h-[300px] rounded-lg border border-white/5 flex items-center justify-center overflow-hidden">
                        {/* Abstract Chart Visualization */}
                        <div className="absolute inset-0 opacity-20">
                            <div className="absolute bottom-0 left-0 w-full h-full bg-gradient-to-t from-indigo-900/40 to-transparent" />
                        </div>
                        <div className="grid grid-cols-4 gap-2 w-full px-8 h-48 items-end">
                            {[40, 65, 30, 85, 50, 75, 45, 60].map((h, i) => (
                                <motion.div 
                                    key={i}
                                    initial={{ height: 0 }}
                                    animate={{ height: `${h}%` }}
                                    transition={{ duration: 0.8, delay: i * 0.1 }}
                                    className={`w-full rounded-t-sm ${i % 2 === 0 ? 'bg-emerald-500/40' : 'bg-rose-500/40'}`}
                                />
                            ))}
                        </div>
                        <div className="absolute bottom-4 text-xs text-gray-500 font-mono">
                            Visual Analytics Module
                        </div>
                    </div>
                  </div>

                </div>
              </motion.div>

              {/* Floating Elements (Decorative) */}
              {/* <div className="fixed bottom-8 right-8 z-50 hidden md:block">
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  whileHover={{ scale: 1.1 }}
                  className="bg-indigo-600 text-white p-4 rounded-2xl shadow-2xl shadow-indigo-600/30 cursor-pointer"
                >
                  <div className="text-xs font-bold uppercase tracking-wider opacity-70 mb-1">Status</div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                    <span className="font-mono font-bold">LIVE FEED</span>
                  </div>
                </motion.div>
              </div> */}

            </div>
          </main>
        </div>
      {/* </div> */}

      <style jsx global>{`
        @keyframes gradient {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .animate-gradient {
          background-size: 200% 200%;
          animation: gradient 4s ease infinite;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #0B0B14;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #333;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #444;
        }
      `}</style>
    </main>
  );
}
