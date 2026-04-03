"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "framer-motion";
import {
  Plus,
  ExternalLink,
  RefreshCcw,
  ShieldCheck,
  Clock,
  UploadCloud,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import type { ProfileWallet } from "../lib/profile-api";
import { formatDateTime, truncateMiddle } from "../lib/profile-format";

// --- The Ultra-Premium Button Component ---
export const UltimateButton = ({ onClick, disabled, children }: any) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  
  // Mouse tracking for the "Glow" effect
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const handleMouseMove = ({ clientX, clientY, currentTarget }: React.MouseEvent) => {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  };

  return (
    <motion.button
      ref={buttonRef}
      onClick={onClick}
      disabled={disabled}
      onMouseMove={handleMouseMove}
      className="group relative flex items-center gap-2 overflow-hidden rounded-xl px-7 py-3.5 text-sm font-bold text-white transition-all disabled:opacity-50"
      style={{
        background: "#0a0a0a", // Dark base for contrast
      }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      {/* 1. Animated Spinning Border (The "Aura") */}
      <div className="absolute inset-0 z-0">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          className="absolute inset-[-200%] opacity-40 group-hover:opacity-100 transition-opacity"
          style={{
            background: "conic-gradient(from 0deg, transparent 0%, #4F46E5 25%, #EC4899 50%, #7C3AED 75%, transparent 100%)",
          }}
        />
      </div>

      {/* 2. Inner Content Background */}
      <div className="absolute inset-[1.5px] z-10 rounded-[11px] bg-neutral-900/80 transition-colors" />

      {/* 3. Interactive Radial Glow (Follows Mouse) */}
      <motion.div
        className="absolute inset-0 z-20 pointer-events-none opacity-100 transition-opacity duration-500"
        style={{
          background: useTransform(
            [mouseX, mouseY],
            ([x, y]) => `radial-gradient(circle 80px at ${x}px ${y}px, rgba(124, 58, 237, 0.3), transparent)`
          ),
        }}
      />

      {/* 4. Stardust Particle Layer */}
      <AnimatePresence>
        {true && (
          <div className="absolute inset-0 z-20">
            {[...Array(6)].map((_, i) => (
              <motion.span
                key={i}
                className="absolute h-1 w-1 bg-white rounded-full"
                initial={{ opacity: 0, y: 20, x: Math.random() * 100 + "%" }}
                animate={{ opacity: [0, 1, 0], y: -20 }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  delay: i * 0.4,
                }}
              />
            ))}
          </div>
        )}
      </AnimatePresence>

      {/* 5. Content */}
      <span className="relative z-30 flex items-center gap-2 tracking-wide">
        {children}
      </span>
    </motion.button>
  );
};

export default function ProfileWallets({
  wallets = [],
  onLinkWallet,
  userId,
  onImageUploadSuccess,
  apiKey,
}: ProfileWalletsProps) {
  const [localWallets, setLocalWallets] = useState<ProfileWallet[]>(wallets);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    setLocalWallets(wallets);
  }, [wallets]);

  const handleImageUpload = async (file: File) => {
    if (!userId) {
      setUploadError("Please connect your wallet first");
      return null;
    }
    setIsUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/profiles/${userId}/avatar`, {
        method: "POST",
        headers: apiKey ? { "x-api-key": apiKey } : {},
        body: formData,
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Upload failed");

      const imageUrl = result.url || result.image_url || result.data?.url;
      if (imageUrl && onImageUploadSuccess) onImageUploadSuccess(imageUrl);
      return imageUrl;
    } catch (error: any) {
      setUploadError(error.message);
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <section className="space-y-8 py-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.1)]">
            <ShieldCheck size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white">
              Security & Wallets
            </h2>
            <p className="text-sm text-neutral-400">
              Manage connected accounts and cryptographic identities.
            </p>
          </div>
        </div>

        {/* --- Using the Ultimate Button here --- */}
        {/* <UltimateButton onClick={onLinkWallet} disabled={!onLinkWallet}>
          <Plus size={18} className="transition-transform group-hover:rotate-90" />
          Link New Wallet
        </UltimateButton> */}
      </div>

      <div className="grid gap-3">
        <AnimatePresence mode="popLayout">
          {localWallets.length > 0 ? (
            localWallets.map((wallet, index) => (
              <motion.div
                key={wallet.address}
                layoutId={wallet.address}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: index * 0.05 }}
                className="group relative flex flex-col gap-4 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 transition-colors hover:border-neutral-700 hover:bg-neutral-900/60 md:flex-row md:items-center"
              >
                <div className="relative h-12 w-12 shrink-0 group">
                  <a 
                    href={`/portfolio?address=${wallet.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute -right-1 -top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/20 text-blue-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-blue-500/30"
                    aria-label="View portfolio"
                    title="View Portfolio"
                  >
                    <ExternalLink size={12} />
                  </a>
                  <img
                    src={`https://avatar.vercel.sh/${wallet.address}.svg`}
                    alt="Wallet Avatar"
                    className="h-full w-full rounded-lg border border-neutral-700 bg-neutral-800 object-cover"
                  />
                  <label className="absolute -right-2 -top-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-neutral-700 bg-neutral-900 text-neutral-400 opacity-0 transition-all hover:text-white group-hover:opacity-100">
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={(e) =>
                        e.target.files?.[0] &&
                        handleImageUpload(e.target.files[0])
                      }
                      disabled={isUploading}
                    />
                    <UploadCloud size={14} />
                  </label>
                </div>

                <div className="flex-1 space-y-1">
                  <div className="flex items-start gap-2 w-full">
                    <div className="min-w-0">
                      <div className="font-mono text-sm font-medium text-blue-400 break-all">
                        {wallet.address}
                      </div>
                    </div>
                    <span className="flex-shrink-0 rounded-full bg-neutral-800 px-2 py-0.5 text-[10px] font-bold uppercase text-neutral-500">
                      {wallet.network || "Solana"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-neutral-500">
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      Updated {formatDateTime(wallet.updated_at)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 border-t border-neutral-800 pt-3 md:border-none md:pt-0">
                  <button className="group relative flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-neutral-300 hover:text-white">
                    <ExternalLink size={16} />
                  </button>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/5 bg-neutral-950/50 p-8 text-center backdrop-blur-sm">
              <RefreshCcw size={32} className="animate-spin-slow text-neutral-700 mb-4" />
              <p className="text-neutral-400 mb-6">No wallets detected.</p>
              <motion.button
                onClick={onLinkWallet}
                className="group relative flex items-center justify-center min-w-[180px] overflow-hidden rounded-xl px-8 py-3.5 text-xs font-black uppercase tracking-widest text-white transition-all disabled:opacity-50"
                style={{ background: "#0D0D0D" }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="absolute inset-0 z-0">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-[-200%] opacity-40 group-hover:opacity-100 transition-opacity"
                    style={{
                      background: "conic-gradient(from 0deg, transparent 0%, #10B981 25%, #3B82F6 50%, #8B5CF6 75%, transparent 100%)",
                    }}
                  />
                </div>
                <div className="absolute inset-[1.5px] z-10 rounded-[11px] bg-[#0D0D0D] group-hover:bg-neutral-900 transition-colors" />
                <span className="relative z-20 flex items-center gap-2">
                  <span>Link Wallet Now</span>
                  <ArrowRight size={16} />
                </span>
              </motion.button>
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Global Status Notifications */}
      <AnimatePresence>
        {(isUploading || uploadError) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-lg border px-4 py-3 shadow-2xl backdrop-blur-md ${
              uploadError
                ? "border-red-500/50 bg-red-500/10 text-red-200"
                : "border-emerald-500/50 bg-neutral-900/90 text-emerald-400"
            }`}
          >
            {isUploading ? <RefreshCcw size={18} className="animate-spin" /> : <AlertCircle size={18} />}
            <span className="text-sm font-medium">
              {uploadError || "Syncing profile..."}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </section> 
  );
}

interface ProfileWalletsProps {
  wallets: ProfileWallet[];
  onLinkWallet?: () => void;
  userId?: number | string | null;
  onImageUploadSuccess?: (imageUrl: string) => void;
  apiKey?: string;
}
