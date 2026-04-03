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

const DEFAULT_IMAGE_URL = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSuqOuCqB99JERXN81cgLxhxO7-ktwDjh5SAA&s";

// --- The High-End Button Component ---
const FinalizeButton = ({ onClick, disabled, loading, children }: any) => {
  const [isHovered, setIsHovered] = useState(false);
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
      disabled={disabled || loading}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group relative flex items-center justify-center min-w-[180px] overflow-hidden rounded-xl px-8 py-3.5 text-xs font-black uppercase tracking-widest text-white transition-all disabled:opacity-50"
      style={{ background: "#0D0D0D" }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      {/* 1. Animated Spinning Border */}
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

      {/* 2. Inner Content Background */}
      <div className="absolute inset-[1.5px] z-10 rounded-[11px] bg-[#0D0D0D] group-hover:bg-neutral-900 transition-colors" />

      {/* 3. Interactive Mouse Glow */}
      <motion.div
        className="absolute inset-0 z-20 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{
          background: useTransform(
            [mouseX, mouseY],
            ([x, y]) => `radial-gradient(circle 100px at ${x}px ${y}px, rgba(16, 185, 129, 0.2), transparent)`
          ),
        }}
      />

      {/* 4. Stardust Particles */}
      <AnimatePresence>
        {isHovered && (
          <div className="absolute inset-0 z-20 pointer-events-none">
            {[...Array(5)].map((_, i) => (
              <motion.span
                key={i}
                className="absolute h-1 w-1 bg-white rounded-full"
                initial={{ opacity: 0, y: 15, x: Math.random() * 80 + 10 + "%" }}
                animate={{ opacity: [0, 1, 0], y: -15 }}
                transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.3 }}
              />
            ))}
          </div>
        )}
      </AnimatePresence>

      <span className="relative z-30 flex items-center gap-2">
        {loading ? <Loader2 className="animate-spin" size={16} /> : children}
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
};

export default function CreateProfileModal({
  isOpen,
  onClose,
  onSave,
  walletAddress,
  initialProfile,
  apiKey,
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

  return (
    <AnimatePresence>
      {isOpen && (
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
            className="relative w-full max-w-2xl overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#070707] shadow-[0_0_50px_rgba(0,0,0,0.5)]"
          >
            {/* Top Header */}
            <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.01] px-10 py-8">
              <div>
                <h2 className="text-2xl font-black tracking-tighter text-white uppercase italic">Initialize Identity</h2>
                <div className="flex items-center gap-2 mt-1">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <p className="text-[10px] font-bold text-neutral-500 tracking-[0.2em] uppercase">Status: Connected // {walletAddress?.slice(0, 10)}</p>
                </div>
              </div>
              <button onClick={onClose} className="rounded-full bg-white/5 p-2.5 text-neutral-400 hover:bg-white/10 hover:text-white transition-all">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="max-h-[65vh] overflow-y-auto p-10 space-y-10 custom-scrollbar">
              
              {/* Avatar & Basic Info Grid */}
              <div className="grid gap-10 md:grid-cols-[160px,1fr]">
                <div className="relative group mx-auto md:mx-0">
                  <div className="h-40 w-40 overflow-hidden rounded-[2rem] border border-white/10 bg-neutral-900 transition-all group-hover:border-emerald-500/50 shadow-2xl">
                    <img src={formData.imageUrl} className="h-full w-full object-cover opacity-90 group-hover:opacity-100 transition-all duration-500 group-hover:scale-110" />
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 cursor-pointer transition-all backdrop-blur-sm"
                    >
                      {isUploading ? <Loader2 className="animate-spin text-emerald-500" /> : (
                        <>
                          <Camera size={28} className="text-white mb-2" />
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
                      className="w-full rounded-2xl border border-white/5 bg-white/[0.02] px-5 py-4 text-sm text-white placeholder:text-neutral-700 focus:border-emerald-500/50 focus:bg-white/[0.05] focus:outline-none transition-all"
                      placeholder="e.g. shadow_trader"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-500">Public Alias</label>
                    <input 
                      value={formData.displayName}
                      onChange={e => setFormData({...formData, displayName: e.target.value})}
                      className="w-full rounded-2xl border border-white/5 bg-white/[0.02] px-5 py-4 text-sm text-white placeholder:text-neutral-700 focus:border-emerald-500/50 focus:bg-white/[0.05] focus:outline-none transition-all"
                      placeholder="Display Name"
                    />
                  </div>
                </div>
              </div>

              {/* Bio */}
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Transmission Intel (Bio)</label>
                <textarea 
                  value={formData.bio}
                  onChange={e => setFormData({...formData, bio: e.target.value})}
                  rows={3}
                  className="w-full rounded-2xl border border-white/5 bg-white/[0.02] px-6 py-5 text-sm text-white focus:border-emerald-500/50 focus:bg-white/[0.05] focus:outline-none transition-all resize-none leading-relaxed"
                  placeholder="Encryption key decrypted: Input profile biography here..."
                />
              </div>

              {/* Socials Grid */}
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
                      className="w-full rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-xs text-white focus:border-white/20 focus:outline-none transition-all"
                      placeholder="https://..."
                    />
                  </div>
                ))}
              </div>

              {/* Tags & Wallet */}
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-500"><Hash size={12} className="text-pink-500"/> Identity Tags</label>
                  <input 
                    value={formData.tagsInput}
                    onChange={e => setFormData({...formData, tagsInput: e.target.value})}
                    className="w-full rounded-2xl border border-white/5 bg-white/[0.02] px-5 py-4 text-xs text-white placeholder:text-neutral-700"
                    placeholder="Degen, Alpha, Developer..."
                  />
                </div>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-500"><Shield size={12} className="text-emerald-500"/> Bound Signature</label>
                  <div className="w-full rounded-2xl border border-white/5 bg-black/40 px-5 py-4 text-[10px] font-mono text-neutral-500 truncate border-dashed italic">
                    {walletAddress}
                  </div>
                </div>
              </div>
            </form>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-white/5 bg-white/[0.01] px-10 py-8">
              <div className="max-w-[200px]">
                {error && (
                  <motion.p 
                    initial={{ opacity: 0, x: -10 }} 
                    animate={{ opacity: 1, x: 0 }}
                    className="text-[10px] font-black text-red-500 uppercase tracking-widest leading-tight"
                  >
                    Error: {error}
                  </motion.p>
                )}
              </div>
              
              <FinalizeButton 
                onClick={handleSubmit} 
                loading={isSaving}
                disabled={!formData.handle}
              >
                Finalize Profile
              </FinalizeButton>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}