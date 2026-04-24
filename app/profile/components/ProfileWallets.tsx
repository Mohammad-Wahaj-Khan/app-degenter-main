"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import {
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
import Link from "next/link";

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
      className="group relative flex items-center gap-2 overflow-hidden rounded-2xl border border-[rgba(57,200,166,0.28)] px-7 py-3.5 text-sm font-bold text-[#031611] transition-all disabled:opacity-50"
      style={{
        background:
          "linear-gradient(135deg, rgba(126,246,215,0.98) 0%, rgba(57,200,166,0.96) 48%, rgba(20,98,79,0.98) 100%)",
        boxShadow: "0 16px 32px rgba(0,0,0,0.22), 0 0 24px rgba(57,200,166,0.16)",
      }}
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
    >
      <div className="absolute inset-0 z-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.35),rgba(255,255,255,0.02)_44%,transparent_46%)] opacity-90" />
      <motion.div
        className="absolute inset-0 z-20 pointer-events-none opacity-100 transition-opacity duration-500"
        style={{
          background: useTransform(
            [mouseX, mouseY],
            ([x, y]) => `radial-gradient(circle 90px at ${x}px ${y}px, rgba(255,255,255,0.28), transparent 72%)`
          ),
        }}
      />

      <AnimatePresence>
        {true && (
          <div className="absolute inset-0 z-20">
            {[...Array(6)].map((_, i) => (
              <motion.span
                key={i}
                className="absolute h-1 w-1 rounded-full bg-white/80"
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

      <span className="relative z-30 flex items-center gap-2 tracking-[0.08em]">
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
  const [failedWalletAvatars, setFailedWalletAvatars] = useState<Record<string, boolean>>({});

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
        {/* <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[rgba(57,200,166,0.24)] bg-[linear-gradient(180deg,rgba(57,200,166,0.14),rgba(20,98,79,0.08))] text-[#64e3bf] shadow-[0_0_24px_rgba(57,200,166,0.12)]">
            <ShieldCheck size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white">
              Security & Wallets
            </h2>
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-neutral-500">
              Manage connected accounts and cryptographic identities.
            </p>
          </div>
        </div> */}

        {/* --- Using the Ultimate Button here --- */}
        {/* <UltimateButton onClick={onLinkWallet} disabled={!onLinkWallet}>
          <Plus size={18} className="transition-transform group-hover:rotate-90" />
          Link New Wallet
        </UltimateButton> */}
      </div>

      {/* <div className="grid gap-3">
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
                className="group relative flex flex-col gap-4 rounded-[28px] border border-[rgba(57,200,166,0.10)] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-4 shadow-[inset_0_1px_0_rgba(190,255,242,0.03),inset_0_-18px_30px_rgba(0,0,0,0.18),0_18px_42px_rgba(0,0,0,0.22)] backdrop-blur-[28px] transition-all duration-300 hover:border-[rgba(57,200,166,0.22)] hover:-translate-y-0.5 md:flex-row md:items-center"
              >
                <div className="relative h-14 w-14 shrink-0 group">
                  <Link 
                    href={`/portfolio?address=${wallet.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute -right-1 -top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-[rgba(57,200,166,0.22)] bg-[linear-gradient(180deg,rgba(57,200,166,0.24),rgba(250,78,48,0.16))] text-[#9bf4d7] opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="View portfolio"
                    title="View Portfolio"
                  >
                    <ExternalLink size={12} />
                  </Link>
                  {failedWalletAvatars[wallet.address] ? (
                    <div className="flex h-full w-full items-center justify-center rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[radial-gradient(circle_at_top,rgba(57,200,166,0.18),rgba(17,17,17,1))] font-mono text-sm text-[#aaf5dc]">
                      {truncateMiddle(wallet.address, 2, 2)}
                    </div>
                  ) : (
                    <img
                      src={`https://avatar.vercel.sh/${wallet.address}.svg`}
                      alt="Wallet Avatar"
                      className="h-full w-full rounded-2xl border border-[rgba(255,255,255,0.08)] bg-neutral-800 object-cover"
                      onError={() =>
                        setFailedWalletAvatars((prev) => ({ ...prev, [wallet.address]: true }))
                      }
                    />
                  )}
                  <label className="absolute -right-2 -top-2 flex h-7 w-7 cursor-pointer items-center justify-center rounded-xl border border-[rgba(255,232,173,0.2)] bg-[rgba(10,10,10,0.85)] text-[#d9b460] opacity-0 transition-all hover:text-white group-hover:opacity-100">
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
                      <div className="font-mono text-sm font-medium text-[#d9fff4] break-all">
                        {wallet.address}
                      </div>
                    </div>
                    <span className="flex-shrink-0 rounded-full border border-white/5 bg-white/[0.02] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-400">
                      {wallet.network || "Zigchain"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                    <span className="flex items-center gap-2 rounded-full border border-emerald-400/16 bg-emerald-500/8 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-emerald-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.75)]" />
                      Active
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      Updated {formatDateTime(wallet.updated_at)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 border-t border-white/[0.03] pt-3 md:border-none md:pt-0">
                  <button className="group relative flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgba(57,200,166,0.12)] bg-[linear-gradient(180deg,rgba(57,200,166,0.10),rgba(250,78,48,0.04))] text-[#76eccb] shadow-[inset_0_1px_0_rgba(190,255,242,0.04)] hover:shadow-[0_0_24px_rgba(57,200,166,0.14)]">
                    <ExternalLink size={16} />
                  </button>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center rounded-[30px] border border-dashed border-[rgba(57,200,166,0.12)] bg-[rgba(8,8,8,0.44)] p-8 text-center shadow-[inset_0_1px_0_rgba(190,255,242,0.03)] backdrop-blur-[24px]">
              <RefreshCcw size={32} className="mb-4 animate-spin-slow text-[#39c8a6]/60" />
              <p className="mb-2 text-lg font-semibold text-white">No wallets detected.</p>
              <p className="mb-6 max-w-md text-sm text-neutral-400">
                Link a wallet to unlock security insights, synced identity metadata, and live portfolio analytics.
              </p>
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
      </div> */}

      {/* Global Status Notifications */}
      <AnimatePresence>
        {(isUploading || uploadError) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-md ${
              uploadError
                ? "border-red-500/30 bg-red-500/10 text-red-100"
                : "border-[rgba(57,200,166,0.22)] bg-[rgba(10,10,10,0.88)] text-[#9cf0d5]"
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
