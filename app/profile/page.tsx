"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion"; // High-level animations
import {
  Wallet,
  UserPlus,
  Edit3,
  Loader2,
  LayoutGrid,
  Zap,
  ArrowRight,
} from "lucide-react";
import ProfileSidebar from "./components/ProfileSidebar";
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

const GUEST_WALLET_KEY = "degenterGuestWalletId";
const USER_ID_KEY = "degenterUserId";

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
  const [savedUserId, setSavedUserId] = useState("");
  const [lastWalletAddress, setLastWalletAddress] = useState(address);

  const handleImageUpdate = async (imageUrl: string) => {
    if (!profile) return;

    // Create a new object with the updated image URL and a timestamp
    const newImageUrl = `${imageUrl}`;
    const updatedProfile = {
      ...profile,
      image_url: newImageUrl,
    };

    // Update the UI immediately
    setProfile(updatedProfile);

    // If we have a user_id and API key, update the server
    if (profile.user_id && apiKey) {
      try {
        setIsSaving(true);
        // Update the server with the clean URL (no timestamp)
        await updateProfile({ ...updatedProfile, image_url: imageUrl }, apiKey);
      } catch (error) {
        console.error("Failed to update profile with new image:", error);
        // Revert the local state if the server update fails
        setProfile((prev) => ({ ...prev, image_url: profile.image_url }));
      } finally {
        setIsSaving(false);
      }
    }
  };

  // Cache profile data persistently
  const cacheProfile = (walletAddress: string, profileData: any) => {
    if (!walletAddress) return;

    const cacheKey = `profile_${walletAddress}`;
    const profileToCache = {
      data: profileData,
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
  };

  // Get cached profile data
  const getCachedProfile = (walletAddress?: string) => {
    if (!walletAddress) return null;

    const cacheKey = `profile_${walletAddress}`;
    // Try sessionStorage first
    let cached = sessionStorage.getItem(cacheKey);

    // Fall back to localStorage if not in sessionStorage
    if (!cached) {
      cached = localStorage.getItem(cacheKey);
    }

    if (cached) {
      const parsed = JSON.parse(cached);
      // Only use cache if it's less than 1 hour old
      if (Date.now() - parsed.timestamp < 60 * 60 * 1000) {
        return parsed.data;
      }
    }
    return null;
  };

  // Function to fetch fresh profile data
  const fetchFreshProfile = async (walletAddress: string) => {
    try {
      if (!walletAddress || !apiKey) return false;

      const walletProfile = await getProfileByWallet(walletAddress, apiKey);

      if (walletProfile) {
        // Cache the profile data
        cacheProfile(walletAddress, walletProfile);

        if (walletProfile.handle && walletProfile.user_id) {
          setProfile(walletProfile);
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
          if (Date.now() - cacheTimestamp > 60 * 1000) {
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
    if (storedUserId) {
      setSavedUserId(storedUserId);
    }

    // Check for cached profile on initial load
    if (address) {
      const cachedProfile = getCachedProfile(address);
      if (cachedProfile) {
        setProfile(cachedProfile);
        setHasProfile(!!cachedProfile.handle);
        setIsModalOpen(!cachedProfile.handle);

        // Update in background if cache is older than 1 minute
        const cacheTimestamp = cachedProfile._cachedAt || 0;
        if (Date.now() - cacheTimestamp > 60 * 1000) {
          fetchFreshProfile(address);
        }
      } else {
        // If no cached profile, fetch fresh data
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
        // Don't load again if we already have profile data
        if (profile.handle && profile.user_id) {
          return;
        }

        if (!userId && !handle && !address && !guestWalletId) {
          setIsLoading(false);
          return;
        }

        setIsLoading(true);
        const effectiveHandle = handle || address || guestWalletId;
        const data = userId
          ? await getProfileById(userId, apiKey)
          : await getProfile(effectiveHandle, apiKey);
        if (isActive && data?.handle) {
          setProfile(data);
          setHasProfile(true);
        }
      } catch {
        if (isActive) {
          setError("Unable to load profile from the API.");
          setHasProfile(false);
          if (!profile.handle) {
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
  }, [handle, userId, apiKey, guestWalletId]);

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
            saved = await updateProfile(
              { ...saved, image_url: imageUrl },
              apiKey
            );
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

      if (saved.user_id) {
        localStorage.setItem(USER_ID_KEY, saved.user_id.toString());
        setSavedUserId(saved.user_id.toString());
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
      <div className="animate-header relative z-20 pt-2">
        <Navbar />
        <TopMarketToken />
      </div>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid relative z-10 min-h-screen grid-cols-1 pt-12 px-6 md:grid-cols-[280px,1fr]"
      >
        <ProfileSidebar />

        <section className="px-4 py-6 md:px-12">
          {/* Header Action Bar */}
          <motion.div
            variants={itemVariants}
            className="flex items-center justify-between mb-8"
          >
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
              <p className="text-md font-black uppercase tracking-[0.3em] text-white">
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

                <div className="grid grid-cols-1 gap-6">
                  <ProfileWallets
                    wallets={profile.wallets ?? []}
                    onLinkWallet={() => openView?.()}
                    apiKey={apiKey || ""}
                  />
                  <ProfileEmail />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty-state"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center rounded-3xl border border-white/[0.05] bg-white/[0.02] py-20 text-center backdrop-blur-sm"
              >
                <div className="mb-6 rounded-full bg-neutral-900 p-6 text-neutral-700">
                  <Zap size={48} strokeWidth={1} />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">
                  Terminal Locked
                </h3>
                <p className="max-w-xs text-neutral-500 text-sm mb-8">
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

          {isLoading && (
            <div className="mt-8 flex items-center gap-3 text-neutral-500">
              <Loader2 size={16} className="animate-spin text-emerald-500" />
              <span className="text-[10px] font-bold uppercase tracking-widest">
                Retrieving Encrypted Data...
              </span>
            </div>
          )}
          {error && (
            <p className="mt-4 text-xs font-medium text-red-500/80">{error}</p>
          )}
        </section>
      </motion.div>

      <CreateProfileModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleCreateProfile}
        walletAddress={address ?? guestWalletId ?? undefined}
        initialProfile={profile}
        apiKey={apiKey}
      />
    </main>
  );
}
