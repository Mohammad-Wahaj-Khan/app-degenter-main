"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import {
  X, 
  User, 
  Globe, 
  Twitter, 
  Send, 
  Hash, 
  Shield, 
  Loader2,
  Camera
} from "lucide-react";
import type { Profile } from "../lib/profile-api";
import { uploadProfileImage } from "../lib/profile-api";
import { UltimateButton } from "./ProfileWallets";

const DEFAULT_IMAGE_URL = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSuqOuCqB99JERXN81cgLxhxO7-ktwDjh5SAA&s";

const SecondaryButton = ({ onClick, disabled, children }: any) => {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const handleMouseMove = ({ clientX, clientY, currentTarget }: React.MouseEvent) => {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  };

  return (
    <motion.button
      onClick={onClick}
      type="button"
      disabled={disabled}
      onMouseMove={handleMouseMove}
      className="group relative flex items-center justify-center min-w-[160px] overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02] px-7 py-3.5 text-sm font-bold text-zinc-100 transition-all disabled:opacity-50"
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
    >
      <div className="absolute inset-0 z-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.01)_44%,transparent_48%)] opacity-90" />
      <motion.div
        className="absolute inset-0 z-10 pointer-events-none opacity-100 transition-opacity duration-500"
        style={{
          background: useTransform(
            [mouseX, mouseY],
            ([x, y]) => `radial-gradient(circle 90px at ${x}px ${y}px, rgba(57,200,166,0.16), transparent 72%)`
          ),
        }}
      />
      <span className="relative z-20 flex items-center gap-2 tracking-[0.08em]">
        {children}
      </span>
    </motion.button>
  );
};

type CreateProfileModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: Profile) => Promise<void>;
  walletAddress?: string;
  initialProfile?: Partial<Profile>;
  apiKey?: string;
  inline?: boolean;
};

export default function CreateProfileModal({
  isOpen,
  onClose,
  onSave,
  walletAddress,
  initialProfile,
  apiKey,
  inline = false,
}: CreateProfileModalProps) {
  const [formData, setFormData] = useState({
    handle: "",
    displayName: "",
    bio: "",
    imageUrl: DEFAULT_IMAGE_URL,
    website: "",
    twitter: "",
    telegram: "",
    tagsInput: "",
  });

  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setFormData({
      handle: initialProfile?.handle ?? "",
      displayName: initialProfile?.display_name ?? "",
      bio: initialProfile?.bio ?? "",
      imageUrl: initialProfile?.image_url ?? DEFAULT_IMAGE_URL,
      website: initialProfile?.website ?? "",
      twitter: initialProfile?.twitter ?? "",
      telegram: initialProfile?.telegram ?? "",
      tagsInput: (initialProfile?.tags ?? []).join(", "),
    });
    setError("");
  }, [initialProfile, isOpen]);

  const handleImageUpload = async (file?: File | null) => {
    if (!file) return;
    if (file.type === "image/svg+xml") return alert("SVG not supported");

    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") setFormData(prev => ({ ...prev, imageUrl: reader.result as string })); };
    reader.readAsDataURL(file);

    if (initialProfile?.user_id) {
      try {
        setIsUploading(true);
        const result = await uploadProfileImage(initialProfile.user_id, file, apiKey || "");
        setFormData(prev => ({ ...prev, imageUrl: result.image_url }));
      } catch (e) { alert("Upload failed"); } 
      finally { setIsUploading(false); }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.handle.trim()) return setError("Handle is required");
    
    try {
      setIsSaving(true);
      await onSave({
        handle: formData.handle.trim(),
        display_name: formData.displayName.trim() || undefined,
        bio: formData.bio.trim() || undefined,
        image_url: formData.imageUrl || undefined,
        website: formData.website.trim() || undefined,
        twitter: formData.twitter.trim() || undefined,
        telegram: formData.telegram.trim() || undefined,
        tags: formData.tagsInput.split(",").map(t => t.trim()).filter(Boolean),
        wallets: initialProfile?.wallets || [],
        created_at: ""
      });
      onClose();
    } catch (err: any) { setError(err.message || "Save failed"); } 
    finally { setIsSaving(false); }
  };

  const formContent = (
    <>
      <div className="flex items-center justify-between border-b border-white/[0.03] bg-white/[0.01] px-10 py-8">
        <div>
          <h2 className="text-2xl font-black tracking-tighter text-white uppercase italic">
            {initialProfile?.user_id ? "Edit Identity" : "Initialize Identity"}
          </h2>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">
              Status: Connected // {walletAddress?.slice(0, 16) || "NO_WALLET"}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          type="button"
          className="rounded-full bg-white/5 p-2.5 text-neutral-400 transition-all hover:bg-white/10 hover:text-white"
        >
          <X size={20} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="max-h-[65vh] overflow-y-auto p-10 space-y-10 custom-scrollbar">
              
        <div className="grid gap-10 md:grid-cols-[160px,1fr]">
          <div className="relative group mx-auto md:mx-0">
            <div className="h-40 w-40 overflow-hidden rounded-[2rem] border border-white/[0.05] bg-neutral-900 transition-all group-hover:border-emerald-500/40 shadow-2xl">
              <img src={formData.imageUrl} className="h-full w-full object-cover opacity-90 transition-all duration-500 group-hover:scale-110 group-hover:opacity-100" />
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center bg-black/60 opacity-0 transition-all backdrop-blur-sm group-hover:opacity-100"
              >
                {isUploading ? <Loader2 className="animate-spin text-emerald-500" /> : (
                  <>
                    <Camera size={28} className="mb-2 text-white" />
                    <span className="text-[10px] font-bold uppercase tracking-tighter">Update Source</span>
                  </>
                )}
              </div>
            </div>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e.target.files?.[0])} />
          </div>

          <div className="flex flex-col justify-center gap-6">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-500"><User size={12} className="text-emerald-500"/> Protocol Handle</label>
              <input 
                value={formData.handle} 
                onChange={e => setFormData({...formData, handle: e.target.value})}
                className="w-full rounded-2xl border border-white/[0.03] bg-white/[0.02] px-5 py-4 text-sm text-white placeholder:text-neutral-700 transition-all focus:border-emerald-500/40 focus:bg-white/[0.04] focus:outline-none"
                placeholder="e.g. shadow_trader"
              />
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-500">Public Alias</label>
              <input 
                value={formData.displayName}
                onChange={e => setFormData({...formData, displayName: e.target.value})}
                className="w-full rounded-2xl border border-white/[0.03] bg-white/[0.02] px-5 py-4 text-sm text-white placeholder:text-neutral-700 transition-all focus:border-emerald-500/40 focus:bg-white/[0.04] focus:outline-none"
                placeholder="Display Name"
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Transmission Intel (Bio)</label>
          <textarea 
            value={formData.bio}
            onChange={e => setFormData({...formData, bio: e.target.value})}
            rows={3}
            className="w-full resize-none rounded-2xl border border-white/[0.03] bg-white/[0.02] px-6 py-5 text-sm leading-relaxed text-white transition-all focus:border-emerald-500/40 focus:bg-white/[0.04] focus:outline-none"
            placeholder="Encryption key decrypted: Input profile biography here..."
          />
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {[
            { icon: <Globe size={14}/>, label: "Network", key: "website", color: "text-blue-400" },
            { icon: <Twitter size={14}/>, label: "X-Link", key: "twitter", color: "text-sky-400" },
            { icon: <Send size={14}/>, label: "Telegram", key: "telegram", color: "text-indigo-400" }
          ].map((item) => (
            <div key={item.key} className="space-y-2 group">
              <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-600 transition-colors group-focus-within:text-white">
                <span className={item.color}>{item.icon}</span> {item.label}
              </label>
              <input 
                value={(formData as any)[item.key]}
                onChange={e => setFormData({...formData, [item.key]: e.target.value})}
                className="w-full rounded-xl border border-white/[0.03] bg-white/[0.02] px-4 py-3 text-xs text-white transition-all focus:border-white/10 focus:outline-none"
                placeholder="https://..."
              />
            </div>
          ))}
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-500"><Hash size={12} className="text-pink-500"/> Identity Tags</label>
            <input 
              value={formData.tagsInput}
              onChange={e => setFormData({...formData, tagsInput: e.target.value})}
              className="w-full rounded-2xl border border-white/[0.03] bg-white/[0.02] px-5 py-4 text-xs text-white placeholder:text-neutral-700"
              placeholder="Degen, Alpha, Developer..."
            />
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-500"><Shield size={12} className="text-emerald-500"/> Bound Signature</label>
            <div className="w-full truncate rounded-2xl border border-white/[0.03] border-dashed bg-black/40 px-5 py-4 text-[10px] font-mono italic text-neutral-500">
              {walletAddress}
            </div>
          </div>
        </div>
      </form>

      <div className="flex flex-col items-start justify-between gap-4 border-t border-white/[0.03] bg-white/[0.01] px-10 py-8 sm:flex-row sm:items-center">
        <div className="max-w-[240px]">
          {error && (
            <motion.p 
              initial={{ opacity: 0, x: -10 }} 
              animate={{ opacity: 1, x: 0 }}
              className="text-[10px] font-black uppercase tracking-widest leading-tight text-red-500"
            >
              Error: {error}
            </motion.p>
          )}
        </div>

        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <SecondaryButton onClick={onClose} disabled={isSaving}>
            Cancel
          </SecondaryButton>
          <UltimateButton
            onClick={handleSubmit}
            disabled={!formData.handle || isSaving}
          >
            {isSaving ? <Loader2 className="animate-spin" size={16} /> : null}
            {initialProfile?.user_id ? "Save Profile" : "Finalize Profile"}
          </UltimateButton>
        </div>
      </div>
    </>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        inline ? (
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="relative overflow-hidden rounded-[2.25rem] border border-[rgba(57,200,166,0.18)] bg-[rgba(7,7,7,0.82)] shadow-[0_0_50px_rgba(0,0,0,0.35)] backdrop-blur-[28px]"
          >
            {formContent}
          </motion.section>
        ) : (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="absolute inset-0 bg-black/80 backdrop-blur-xl" 
            />
            
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 30 }}
              className="relative w-full max-w-2xl overflow-hidden rounded-[2.5rem] border border-white/[0.05] bg-[#070707] shadow-[0_0_50px_rgba(0,0,0,0.5)]"
            >
              {formContent}
            </motion.div>
          </div>
        )
      )}
    </AnimatePresence>
  );
}
