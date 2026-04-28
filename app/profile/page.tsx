"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion"; // High-level animations
import { Loader2, Zap, ArrowRight } from "lucide-react";
import ProfileHeader from "./components/ProfileHeader";
import ProfileWallets from "./components/ProfileWallets";
import ProfileEmail from "./components/ProfileEmail";
import CreateProfileModal from "./components/CreateProfileModal";
import {
  createProfile,
  getProfile,
  getProfileById,
  getProfileByWallet,
  updateProfile,
  uploadProfileImage,
  type Profile,
} from "./lib/profile-api";
import Navbar from "../components/navbar";
import TopMarketToken from "../components/TopMarketToken";
import { useChain } from "@cosmos-kit/react";
import { CHAIN_NAME } from "../config/chain";
import { API_KEY } from "@/lib/api";
import { applyPageMetadata } from "@/lib/page-metadata";

const GUEST_WALLET_KEY = "degenterGuestWalletId";
const USER_ID_KEY = "degenterUserId";
const PROFILE_CACHE_TTL_MS = 60 * 60 * 1000;
const PROFILE_REFRESH_AFTER_MS = 60 * 1000;
const PROFILE_IMAGE_URL_PREFIX = "degenterProfileImage";

type CachedProfile = Profile & {
  _cachedAt?: number;
};

const defaultProfile: Profile = {
  created_at: new Date().toISOString(),
  handle: "",
  display_name: "",
  bio: "On-chain trader",
  image_url: "",
  website: "https://example.com",
  twitter: "@myhandle",
  telegram: "https://t.me/myhandle",
  tags: ["defi", "memes"],
  wallets: [],
};

export default function ProfilePage() {
  useEffect(() => {
    applyPageMetadata({
      pageName: "Profile",
      description: "Profile | Degenter.io",
    });
  }, []);

  const searchParams = useSearchParams();
  const userId = useMemo(
    () => searchParams.get("userId")?.trim() || "",
    [searchParams]
  );
  const handle = useMemo(
    () => searchParams.get("handle")?.trim() || "",
    [searchParams]
  );
  const apiKey = API_KEY;
  const { address, openView, isWalletConnected } = useChain(
    (CHAIN_NAME as string) || "zigchain-1"
  );
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1 },
  };
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hasProfile, setHasProfile] = useState(true);
  const [guestWalletId, setGuestWalletId] = useState("");
  const [lastWalletAddress, setLastWalletAddress] = useState("");

  const getProfileImageCacheKey = (walletAddress?: string) =>
    walletAddress ? `${PROFILE_IMAGE_URL_PREFIX}_${walletAddress}` : "";

  const cacheProfileImage = (walletAddress: string, imageUrl?: string) => {
    if (!walletAddress || typeof window === "undefined") return;

    const cacheKey = getProfileImageCacheKey(walletAddress);
    if (!cacheKey) return;

    if (imageUrl?.trim()) {
      const payload = JSON.stringify({
        image_url: imageUrl.trim(),
        timestamp: Date.now(),
      });
      sessionStorage.setItem(cacheKey, payload);
      localStorage.setItem(cacheKey, payload);
      return;
    }

    sessionStorage.removeItem(cacheKey);
    localStorage.removeItem(cacheKey);
  };

  const getCachedProfileImage = (walletAddress?: string) => {
    if (!walletAddress || typeof window === "undefined") return "";

    const cacheKey = getProfileImageCacheKey(walletAddress);
    if (!cacheKey) return "";

    try {
      const cached =
        sessionStorage.getItem(cacheKey) || localStorage.getItem(cacheKey);
      if (!cached) return "";

      const parsed = JSON.parse(cached);
      return typeof parsed?.image_url === "string" ? parsed.image_url.trim() : "";
    } catch (error) {
      console.error("Failed to parse cached profile image:", error);
      return "";
    }
  };

  const mergeProfileWithCachedImage = (
    walletAddress: string,
    incomingProfile: Profile,
    cachedProfile?: CachedProfile | null
  ): CachedProfile => {
    const incomingImage = (incomingProfile.image_url || "").trim();
    const cachedImage =
      getCachedProfileImage(walletAddress) ||
      (cachedProfile?.image_url || "").trim();

    return {
      ...cachedProfile,
      ...incomingProfile,
      image_url: incomingImage || cachedImage,
      _cachedAt: Date.now(),
    };
  };

  const handleImageUpdate = async (imageUrl: string) => {
    if (!profile) return;

    const newImageUrl = `${imageUrl}`;
    const updatedProfile = {
      ...profile,
      image_url: newImageUrl,
    };

    setProfile(updatedProfile);
    const primaryWallet = updatedProfile.wallets?.find((wallet) => wallet?.address)?.address;
    if (primaryWallet) {
      cacheProfileImage(primaryWallet, newImageUrl);
      cacheProfile(primaryWallet, updatedProfile);
    }

    if (profile.user_id && apiKey) {
      try {
        setIsSaving(true);
        await updateProfile({ ...updatedProfile, image_url: imageUrl }, apiKey);
      } catch (error) {
        console.error("Failed to update profile with new image:", error);
        setProfile((prev) => ({ ...prev, image_url: profile.image_url }));
        if (primaryWallet) {
          cacheProfileImage(primaryWallet, profile.image_url);
          cacheProfile(primaryWallet, { ...updatedProfile, image_url: profile.image_url });
        }
      } finally {
        setIsSaving(false);
      }
    }
  };

  // Cache profile data persistently
  const cacheProfile = (walletAddress: string, profileData: Profile) => {
    if (!walletAddress) return;

    const cacheKey = `profile_${walletAddress}`;
    const mergedProfile = mergeProfileWithCachedImage(
      walletAddress,
      profileData,
      getCachedProfile(walletAddress)
    );
    const profileToCache = {
      data: mergedProfile,
      timestamp: Date.now(),
    };

    // Store in both sessionStorage and localStorage
    sessionStorage.setItem(cacheKey, JSON.stringify(profileToCache));
    localStorage.setItem(cacheKey, JSON.stringify(profileToCache));

    // If this is the current user's profile, also store a reference
    if (walletAddress === address) {
      localStorage.setItem("currentProfile", walletAddress);
      if (profileData?.user_id) {
        localStorage.setItem(USER_ID_KEY, String(profileData.user_id));
      }
    }

    if (mergedProfile.image_url) {
      cacheProfileImage(walletAddress, mergedProfile.image_url);
    }
  };

  // Get cached profile data
  const getCachedProfile = (walletAddress?: string): CachedProfile | null => {
    if (!walletAddress) return null;

    const cacheKey = `profile_${walletAddress}`;
    let cached: string | null = null;

    try {
      cached = sessionStorage.getItem(cacheKey) || localStorage.getItem(cacheKey);
      if (!cached) return null;

      const parsed = JSON.parse(cached);
      if (Date.now() - (parsed?.timestamp ?? 0) < PROFILE_CACHE_TTL_MS) {
        return mergeProfileWithCachedImage(
          walletAddress,
          (parsed?.data ?? {}) as Profile,
          (parsed?.data ?? null) as CachedProfile | null
        );
      }
    } catch (error) {
      console.error("Failed to parse cached profile:", error);
    }

    return null;
  };

  // Function to fetch fresh profile data
  const fetchFreshProfile = async (walletAddress: string) => {
    try {
      if (!walletAddress || !apiKey) return false;

      const walletProfile = await getProfileByWallet(walletAddress, apiKey);

      if (walletProfile) {
        const mergedProfile = mergeProfileWithCachedImage(
          walletAddress,
          walletProfile,
          getCachedProfile(walletAddress)
        );
        cacheProfile(walletAddress, mergedProfile);

        if (mergedProfile.handle && mergedProfile.user_id) {
          setProfile(mergedProfile);
          setHasProfile(true);
          setIsModalOpen(false);
          return true;
        }
      }

      // If no valid profile exists
      const newProfile: Profile = {
        ...defaultProfile,
        wallets: [
          {
            address: walletAddress,
            label: "Main Wallet",
            is_primary: true,
            network: "Zigchain",
          },
        ],
      };

      cacheProfile(walletAddress, newProfile);
      setProfile(newProfile);
      setHasProfile(false);
      setIsModalOpen(true);
      return false;
    } catch (error) {
      console.error("Error fetching fresh profile:", error);
      // Don't show error to user if we have cached data
      if (address && !getCachedProfile(address)) {
        setError("Failed to load profile");
      }
      return false;
    }
  };

  // Handle wallet connection and profile check with enhanced caching
  useEffect(() => {
    // Skip if no address or API key, or if address hasn't changed
    if (!address || !apiKey || address === lastWalletAddress) return;

    // Update the last wallet address to prevent duplicate calls
    setLastWalletAddress(address);

    const loadProfile = async () => {
      try {
        setIsLoading(true);

        // Check for cached profile first
        const cachedProfile = getCachedProfile(address);
        if (cachedProfile) {
          setProfile(cachedProfile);
          setHasProfile(!!cachedProfile.handle);
          setIsModalOpen(!cachedProfile.handle);

          // Update in background if cache is older than 1 minute
          const cacheTimestamp = cachedProfile._cachedAt || 0;
          if (Date.now() - cacheTimestamp > PROFILE_REFRESH_AFTER_MS) {
            fetchFreshProfile(address);
          }
          return;
        }

        // No valid cache, fetch fresh data
        await fetchFreshProfile(address);
      } catch (error) {
        console.error("Error loading profile:", error);
        setError("Failed to load profile");
        setHasProfile(false);
      } finally {
        setIsLoading(false);
      }
    };

    // Only load if wallet is connected
    if (isWalletConnected) {
      loadProfile();
    }
  }, [address, apiKey, isWalletConnected]);

  // Initial load and guest wallet handling
  useEffect(() => {
    // Check for guest wallet ID
    const storedWalletId = localStorage.getItem(GUEST_WALLET_KEY);
    if (storedWalletId) {
      setGuestWalletId(storedWalletId);
    }

    // Check for user ID
    const storedUserId = localStorage.getItem(USER_ID_KEY);
    if (storedUserId) localStorage.setItem(USER_ID_KEY, storedUserId);

    // Check for cached profile on initial load
    if (address) {
      const cachedProfile = getCachedProfile(address);
      if (cachedProfile) {
        setProfile(cachedProfile);
        setHasProfile(!!cachedProfile.handle);
        setIsModalOpen(!cachedProfile.handle);

        const cacheTimestamp = cachedProfile._cachedAt || 0;
        if (Date.now() - cacheTimestamp > PROFILE_REFRESH_AFTER_MS) {
          fetchFreshProfile(address);
        }
      } else {
        fetchFreshProfile(address);
      }
    }
  }, [address]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedWallet = localStorage.getItem(GUEST_WALLET_KEY);
    if (!storedWallet) {
      const generated =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? `guest-${crypto.randomUUID()}`
          : `guest-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(GUEST_WALLET_KEY, generated);
      setGuestWalletId(generated);
    }
  }, []);

  useEffect(() => {
    let isActive = true;

    const loadProfile = async () => {
      setError("");

      try {
        if (profile.handle && profile.user_id) {
          return;
        }

        if (!userId && !handle && !address) {
          setIsLoading(false);
          return;
        }

        setIsLoading(true);
        const effectiveHandle = handle || address;
        if (!effectiveHandle && !userId) {
          setIsLoading(false);
          return;
        }
        const data = userId
          ? await getProfileById(userId, apiKey)
          : await getProfile(effectiveHandle || "", apiKey);
        if (isActive && data?.handle) {
          const walletAddress =
            data.wallets?.find((wallet) => wallet?.address)?.address || address || "";
          const mergedProfile = walletAddress
            ? mergeProfileWithCachedImage(
                walletAddress,
                data,
                getCachedProfile(walletAddress)
              )
            : { ...data, _cachedAt: Date.now() };

          if (walletAddress) {
            cacheProfile(walletAddress, mergedProfile);
          }

          setProfile(mergedProfile);
          setHasProfile(true);
          setError("");
        }
      } catch {
        if (isActive) {
          const hasRenderableData =
            Boolean(profile.handle) || Boolean(profile.wallets?.length);
          if (!hasRenderableData) {
            setError("Unable to load profile from the API.");
            setHasProfile(false);
            setIsModalOpen(true);
          }
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    loadProfile();

    return () => {
      isActive = false;
    };
  }, [handle, userId, apiKey, address, profile.handle, profile.user_id, profile.wallets]);

  const handleUpgrade = () => {
    setIsModalOpen(true);
  };

  const handleCreateProfile = async (payload: Profile) => {
    if (!apiKey) {
      console.error("API key is missing");
      throw new Error("API key is required to create a profile");
    }

    try {
      setIsSaving(true);

      // First, create the profile without the image if it's a base64 string
      let imageUrl = payload.image_url || defaultProfile.image_url || "";

      // Create initial profile data without the image if it's a base64 string
      const initialProfileData = {
        handle: payload.handle,
        display_name: payload.display_name || payload.handle,
        bio: payload.bio || "",
        image_url: imageUrl.startsWith("data:") ? "" : imageUrl, // Don't send base64 directly
        website: payload.website || "",
        twitter: payload.twitter || "",
        telegram: payload.telegram || "",
        tags: Array.isArray(payload.tags) ? payload.tags : [],
        wallets: [
          {
            address: address || "",
            label: "Main Wallet",
            is_primary: true,
            network: "Zigchain",
          },
        ],
      };

      // console.log("Creating/Updating profile with data:", initialProfileData);

      // First create/update the profile
      let saved;
      if (hasProfile && profile.user_id) {
        // Include the handle in the update payload
        const updateData = {
          ...initialProfileData,
          user_id: profile.user_id,
          handle: payload.handle, // Use the new handle from the payload
        };
        saved = await updateProfile(updateData, apiKey);
      } else {
        saved = await createProfile(initialProfileData as Profile, apiKey);
      }

      // Then handle the image upload if it's a base64 string
      if (saved?.user_id && payload.image_url?.startsWith("data:")) {
        try {
          // console.log("Uploading profile image...");
          // Convert base64 to file
          const base64Response = await fetch(payload.image_url);
          const blob = await base64Response.blob();
          const file = new File([blob], "profile.jpg", { type: "image/jpeg" });

          // Upload the image
          const uploadResult = await uploadProfileImage(
            saved.user_id,
            file,
            apiKey
          );
          imageUrl = uploadResult.image_url;

          // Update the profile with the new image URL
          if (imageUrl) {
            saved = {
              ...(await updateProfile(
                { ...saved, image_url: imageUrl },
                apiKey
              )),
              image_url: imageUrl,
            };
          }
        } catch (uploadError) {
          console.error("Error uploading profile image:", uploadError);
          // Don't fail the whole process if image upload fails
        }
      }

      // console.log("Profile saved successfully:", saved);

      setProfile(saved);
      setHasProfile(true);
      setIsModalOpen(false);

      const primaryWalletAddress =
        saved.wallets?.find((wallet) => wallet?.address)?.address || address || "";
      if (primaryWalletAddress) {
        cacheProfile(primaryWalletAddress, saved);
      }

      if (saved.user_id) {
        localStorage.setItem(USER_ID_KEY, saved.user_id.toString());
      }
      // Don't return the profile data as the function should return void
    } catch (error) {
      console.error("Error saving profile:", error);
      setError(
        `Failed to save profile: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      throw error;
    } finally {
      setIsSaving(false);
    }
  };

  return (
    // <main className="flex min-h-screen flex-col bg-[#050505] relative overflow-hidden font-sans">
    //   <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
    //     <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-emerald-500/10 blur-[120px] animate-pulse" />
    //     <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-orange-600/5 blur-[120px]" />
    //     <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-[0.03] bg-repeat" />
    //   </div>
      <main className="flex min-h-screen flex-col bg-[#050505] relative overflow-hidden text-white">
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
      <div className="animate-header relative z-20 pt-2">
        <Navbar />
        <TopMarketToken />
      </div>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 min-h-screen px-4 pb-10 pt-12 md:px-6"
      >
        <section className="mx-auto w-full max-w-8xl px-2 py-6 md:px-4 lg:px-6">
          {/* Header Action Bar */}
          <motion.div
            variants={itemVariants}
            className="mb-8 flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-[#d0a23d] shadow-[0_0_12px_rgba(208,162,61,0.85)]" />
              <p className="text-md font-black uppercase tracking-[0.3em] text-[#f5edd8]">
                Profile Overview
              </p>
            </div>

            {/* <div className="flex items-center gap-3">
              {!isWalletConnected ? (
                <button
                  onClick={() => openView()}
                  className="group hidden relative  items-center gap-2 overflow-hidden rounded-xl px-5 py-2.5 text-xs font-black uppercase text-white transition-all hover:scale-105 active:scale-95"
                  style={{
                    background:
                      "linear-gradient(90deg, #4F46E5 0%, #7C3AED 50%, #EC4899 100%)",
                    boxShadow: "0 0 15px rgba(99, 102, 241, 0.5)",
                  }}
                >
                  <span className="relative z-10 flex items-center gap-2">
                    <Wallet size={14} /> Connect
                  </span>
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>
                </button>
              ) : !hasProfile ? (
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="group relative flex items-center gap-2 overflow-hidden rounded-xl px-5 py-2.5 text-xs font-black uppercase text-white transition-all hover:scale-105 active:scale-95"
                  style={{
                    background:
                      "linear-gradient(90deg, #10B981 0%, #3B82F6 50%, #8B5CF6 100%)",
                    boxShadow: "0 0 15px rgba(16, 185, 129, 0.4)",
                  }}
                >
                  <span className="relative z-10 flex items-center gap-2">
                    <UserPlus size={14} /> Initialize Identity
                  </span>
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>
                </button>
              ) : (
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="group relative flex items-center gap-2 overflow-hidden rounded-xl border border-white/10 bg-gradient-to-r from-white/5 to-white/[0.03] px-5 py-2.5 text-xs font-bold uppercase text-white transition-all hover:border-white/20 hover:shadow-[0_0_15px_rgba(99,102,241,0.3)]"
                >
                  <span className="relative z-10 flex items-center gap-2">
                    <Edit3 size={14} /> Edit Identity
                  </span>
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>
                </button>
              )}
            </div> */}
          </motion.div>

          {/* Main Content Area */}
          <AnimatePresence mode="wait">
            {isWalletConnected ? (
              <motion.div
                key="profile-content"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <ProfileHeader
                  profile={profile}
                  onUpgrade={handleUpgrade}
                  isSaving={isSaving}
                  onImageUpdate={handleImageUpdate}
                  apiKey={apiKey || ""}
                />

                <CreateProfileModal
                  isOpen={isModalOpen}
                  onClose={() => setIsModalOpen(false)}
                  onSave={handleCreateProfile}
                  walletAddress={address ?? guestWalletId ?? undefined}
                  initialProfile={profile}
                  apiKey={apiKey}
                  inline
                />

                <div className="grid grid-cols-1 gap-6">
                  <ProfileWallets
                    wallets={profile.wallets ?? []}
                    onLinkWallet={() => openView?.()}
                    apiKey={apiKey || ""}
                  />
                  {/* <ProfileEmail /> */}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty-state"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center rounded-[32px] border border-[#d0a23d]/20 bg-white/[0.03] py-20 text-center shadow-[0_24px_90px_rgba(0,0,0,0.45)] backdrop-blur-[28px]"
              >
                <div className="mb-6 rounded-full border border-[#d0a23d]/20 bg-[#131313]/80 p-6 text-[#d0a23d]/70 shadow-[0_0_35px_rgba(208,162,61,0.08)]">
                  <Zap size={48} strokeWidth={1} />
                </div>
                <h3 className="mb-2 text-2xl font-bold text-white">
                  Terminal Locked
                </h3>
                <p className="mb-8 max-w-xs text-sm text-neutral-400">
                  Establish a secure wallet link to access your on-chain agent
                  profile.
                </p>
                <motion.button
                  onClick={() => openView()}
                  className="group relative flex items-center justify-center min-w-[180px] overflow-hidden rounded-xl px-8 py-3.5 text-xs font-black uppercase tracking-widest text-white transition-all disabled:opacity-50"
                  style={{ background: "#0D0D0D" }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="absolute inset-0 z-0">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{
                        duration: 4,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                      className="absolute inset-[-200%] opacity-40 group-hover:opacity-100 transition-opacity"
                      style={{
                        background:
                          "conic-gradient(from 0deg, transparent 0%, #10B981 25%, #3B82F6 50%, #8B5CF6 75%, transparent 100%)",
                      }}
                    />
                  </div>
                  <div className="absolute inset-[1.5px] z-10 rounded-[11px] bg-[#0D0D0D] group-hover:bg-neutral-900 transition-colors" />
                  <span className="relative z-20 flex items-center gap-2">
                    <span>Link Wallet Now</span>
                    <ArrowRight size={16} />
                  </span>
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* {isLoading && (
            <div className="mt-8 flex items-center gap-3 text-neutral-400">
              <Loader2 size={16} className="animate-spin text-emerald-500" />
              <span className="text-[10px] font-bold uppercase tracking-widest">
                Retrieving Encrypted Data...
              </span>
            </div>
          )} */}
          {error && (
            <p className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/8 px-4 py-3 text-xs font-medium text-amber-100/80 backdrop-blur-xl">
              {error}
            </p>
          )}
        </section>
      </motion.div>

    </main>
  );
}
