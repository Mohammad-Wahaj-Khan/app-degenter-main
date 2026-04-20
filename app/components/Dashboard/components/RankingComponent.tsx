"use client";

import Image from "next/image";
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

// iOS detection helper
const isIOS = (): boolean => {
  if (typeof window === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
         (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
};

// WebGL availability check with iOS-specific constraints
function isWebGLAvailable(): boolean {
  if (typeof window === "undefined") return false;

  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    
    if (!gl) return false;
    
    // iOS-specific: Check for context loss support
    const loseContextExt = (gl as WebGLRenderingContext).getExtension("WEBGL_lose_context");
    if (loseContextExt && isIOS()) {
      // Test if we can actually use the context on iOS
      (gl as WebGLRenderingContext).getParameter((gl as WebGLRenderingContext).VERSION);
    }
    
    return true;
  } catch {
    return false;
  }
}

const STAKED_ZIG_DENOM =
  "coin.zig109f7g2rzl2aqee7z6gffn8kfe9cpqx0mjkk7ethmx8m2hq4xpe9snmaam2.stzig";

export interface RankingItem {
  id: string;
  rank: number;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number;
  market_cap: number;
  total_volume: number;
  image: string;
  tx: number;
  tokenId?: string;
  color?: string;
  textGradient?: string;
}

export interface Token {
  id: string;
  rank?: number;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number;
  market_cap: number;
  total_volume: number;
  image: string;
  tx: number;
  tokenId?: string;
}

const MIN_RANKING_ROWS = 5;
const MAX_RANKING_ROWS = 5;
const RANKING_REPEAT_GROUPS = 60;

type RankingCardStyle = React.CSSProperties & {
  "--ranking-spotlight-x"?: string;
  "--ranking-spotlight-y"?: string;
  "--ranking-spotlight-opacity"?: string;
  "--ranking-spotlight-color"?: string;
};

const isStakedZig = (token: Token) => {
  const symbolLower = (token.symbol || "").toLowerCase();
  const idLower = (token.id || "").toLowerCase();
  return symbolLower === "stzig" || idLower === STAKED_ZIG_DENOM;
};

const RankingComponent: React.FC<{
  rankedTokens: Token[];
  loading?: boolean;
}> = ({ rankedTokens, loading = false }) => {
  const [webglFailed, setWebglFailed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  
  const safeRankedTokens = rankedTokens || [];
  const sortedRankedTokens = useMemo(
    () =>
      [...safeRankedTokens].sort(
        (a, b) => (b.total_volume || 0) - (a.total_volume || 0)
      ),
    [safeRankedTokens]
  );
  const availableCount = Math.min(MAX_RANKING_ROWS, sortedRankedTokens.length);
  const desiredCount = Math.max(MIN_RANKING_ROWS, availableCount);
  const visibleTokens = sortedRankedTokens.slice(0, availableCount);
  const filledRankTokens = [...visibleTokens];

  const defaultToken: RankingItem = {
    id: "0",
    rank: 0,
    name: "Loading...",
    symbol: "N/A",
    current_price: 0,
    price_change_percentage_24h: 0,
    market_cap: 0,
    total_volume: 0,
    image: "",
    tx: 0,
    color: "from-gray-500 to-gray-600",
    textGradient: "from-gray-400 to-gray-500",
  };

  while (filledRankTokens.length < desiredCount) {
    filledRankTokens.push({
      ...defaultToken,
      rank: filledRankTokens.length + 1,
    });
  }

  const rankings: RankingItem[] = filledRankTokens.map((token, index) => ({
    id: token.id || `${index + 1}`,
    rank: token.rank ?? index + 1,
    name: token.name || "N/A",
    symbol: token.symbol || "N/A",
    current_price: token.current_price || 0,
    price_change_percentage_24h: token.price_change_percentage_24h || 0,
    market_cap: token.market_cap || 0,
    total_volume: token.total_volume || 0,
    image: token.image || "",
    tx: token.tx || 0,
    tokenId: token.tokenId,
    color:
      index === 0
        ? "from-[#FF4D00] via-[#FA4E30] to-[#FF4D00]/90"
        : index === 1
        ? "from-[#0B1008] via-[#0B3F27] to-[#16CF78]"
        : index === 2
        ? "from-[#0B1008] via-[#0B3F27] to-[#16CF78]"
        : index === 3
        ? "from-[#060A0D] via-[#06381A] to-[#0CBD83]"
        : "from-[#060A0D] via-[#06381A] to-[#0CBD83]",
    textGradient:
      index === 0
        ? "from-[#FFD178] to-[#FF7F2A]"
        : index === 1
        ? "from-[#42F5C3] to-[#0B7B46]"
        : index === 2
        ? "from-[#E59AEF] to-[#561B4A]"
        : index === 3
        ? "from-[#ADADAD] to-[#1A1A1A]"
        : "from-[#ADADAD] to-[#1A1A1A]",
  }));

  const threeRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const threeCleanupRef = useRef<(() => void) | null>(null);
  const scrollVelocityRef = useRef(0);
  const lastScrollRef = useRef({ top: 0, time: 0 });
  const snapTimeoutRef = useRef<number | null>(null);
  const prefersReducedMotionRef = useRef(false);

  // Detect mobile on mount
  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/.test(navigator.userAgent) || window.innerWidth < 768);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => {
      prefersReducedMotionRef.current = mediaQuery.matches;
    };

    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);

    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  const handleCardPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (prefersReducedMotionRef.current || event.pointerType === "touch") return;

    const card = event.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;

    card.style.setProperty("--ranking-spotlight-x", `${x.toFixed(2)}%`);
    card.style.setProperty("--ranking-spotlight-y", `${y.toFixed(2)}%`);
    card.style.setProperty("--ranking-spotlight-opacity", "1");
  };

  const handleCardPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    const card = event.currentTarget;
    card.style.setProperty("--ranking-spotlight-opacity", "0");
  };

  // Three.js background effect - iOS Optimized
  useEffect(() => {
    if (!threeRef.current || webglFailed) return;
    const el = threeRef.current;

    // Skip Three.js on low-end mobile if needed, or use CSS fallback
    if (isIOS() && window.innerWidth < 768) {
      // Optional: Use CSS fallback for older iPhones to save battery
      // setWebglFailed(true);
      // return;
    }

    if (!isWebGLAvailable()) {
      console.warn("WebGL not available, using CSS fallback");
      setWebglFailed(true);
      return;
    }

    let renderer: THREE.WebGLRenderer | null = null;
    let animationId: number;
    let isActive = true;
    let visibilityHandler: (() => void) | null = null;

    try {
      // iOS-optimized renderer settings
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: !isIOS(), // Disable antialias on iOS for performance
        powerPreference: isIOS() ? "low-power" : "high-performance",
        failIfMajorPerformanceCaveat: false, // Don't fail on iOS
        stencil: false,
        depth: false,
      });
    } catch (err) {
      console.warn("Failed to initialize WebGLRenderer:", err);
      setWebglFailed(true);
      return;
    }

    // Handle context loss (crucial for iOS)
    const canvas = renderer.domElement;
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      console.warn("WebGL context lost");
      isActive = false;
      setWebglFailed(true);
    };
    
    const handleContextRestored = () => {
      console.log("WebGL context restored");
      isActive = true;
    };
    
    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);

    renderer.setClearColor(0x000000, 0);
    // Limit pixel ratio on iOS to prevent memory issues
    const dpr = isIOS() ? Math.min(window.devicePixelRatio, 2) : Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    
    let width = el.clientWidth || 400;
    let height = el.clientHeight || 500;
    renderer.setSize(width, height);
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.top = "0";
    renderer.domElement.style.left = "0";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(
      width / -2,
      width / 2,
      height / 2,
      height / -2,
      0.1,
      1000
    );
    camera.position.z = 10;

    // Reduce box count on mobile
    const boxCount = Math.max(1, isIOS() ? Math.min(3, rankings.length) : rankings.length);
    const meshes: THREE.Mesh[] = [];
    const boxWidth = isIOS() ? 80 : 120; // Smaller on iOS
    const boxHeight = isIOS() ? 30 : 40;

    const boxGeometry = new THREE.BoxGeometry(boxWidth, boxHeight, 20);
    const baseMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.12,
    });

    const angleStep = (Math.PI * 2) / boxCount;
    let radius = Math.min(width, height) * 0.28;
    let centerX = -width / 2 + boxWidth / 2 + 20;
    let centerY = 0;

    for (let i = 0; i < boxCount; i++) {
      const mesh = new THREE.Mesh(boxGeometry, baseMaterial.clone());
      const baseAngle = -Math.PI / 2 + i * angleStep;
      mesh.userData = { index: i, baseAngle };
      mesh.position.x = centerX + Math.cos(baseAngle) * radius;
      mesh.position.y = centerY + Math.sin(baseAngle) * radius;
      scene.add(mesh);
      meshes.push(mesh);
    }

    let activeIndex = 0;
    let targetRotation = 0;
    let currentRotation = 0;

    function updateTargetsForActive(idx: number) {
      if (!boxCount) return;
      const targetIdx = ((idx % boxCount) + boxCount) % boxCount;
      const diff = targetIdx - activeIndex;
      if (diff === 0) {
        activeIndex = targetIdx;
        return;
      }
      let signedDiff = diff;
      if (signedDiff > boxCount / 2) signedDiff -= boxCount;
      if (signedDiff < -boxCount / 2) signedDiff += boxCount;
      targetRotation += signedDiff * angleStep;
      activeIndex = targetIdx;
    }

    updateTargetsForActive(activeIndex);

    // Visibility API to pause rendering when tab hidden (saves battery on iOS)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        isActive = false;
      } else {
        isActive = true;
        animate();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    visibilityHandler = handleVisibilityChange;

    let lastTime = performance.now();
    const targetFPS = isIOS() ? 30 : 60; // Lower FPS on iOS
    const frameInterval = 1000 / targetFPS;

    function animate() {
      if (!isActive || !renderer) return;
      
      animationId = requestAnimationFrame(animate);
      
      const currentTime = performance.now();
      const delta = currentTime - lastTime;
      
      if (delta < frameInterval) return; // Throttle on iOS
      lastTime = currentTime - (delta % frameInterval);

      currentRotation += (targetRotation - currentRotation) * 0.08;
      
      for (let i = 0; i < meshes.length; i++) {
        const mesh = meshes[i];
        const baseAngle = (mesh.userData as { baseAngle: number }).baseAngle;
        const angle = baseAngle + currentRotation;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        
        mesh.position.x += (x - mesh.position.x) * 0.12;
        mesh.position.y += (y - mesh.position.y) * 0.12;

        const closeness = Math.cos(angle + Math.PI / 2);
        const closenessNorm = Math.max(0, closeness);
        const targetScale = 1 + 0.28 * closenessNorm;
        
        mesh.scale.x += (targetScale - mesh.scale.x) * 0.12;
        mesh.scale.y += (targetScale - mesh.scale.y) * 0.12;

        const mat = mesh.material as THREE.MeshBasicMaterial;
        const targetOpacity = 0.08 + 0.32 * closenessNorm;
        mat.opacity += (targetOpacity - mat.opacity) * 0.12;

        mesh.position.z += (5 * closenessNorm - mesh.position.z) * 0.12;
      }

      renderer.render(scene, camera);
    }
    
    animate();

    function onResize() {
      if (!renderer) return;
      width = el.clientWidth || 400;
      height = el.clientHeight || 500;
      renderer.setSize(width, height);
      camera.left = -width / 2;
      camera.right = width / 2;
      camera.top = height / 2;
      camera.bottom = -height / 2;
      camera.updateProjectionMatrix();
      radius = Math.min(width, height) * 0.28;
      centerX = -width / 2 + boxWidth / 2 + 20;
      centerY = 0;
      updateTargetsForActive(activeIndex);
    }

    window.addEventListener("resize", onResize);
    onResize();

    let pending = false;
    function findActiveIndex() {
      if (!listRef.current) return;
      const container = listRef.current;
      const containerRect = container.getBoundingClientRect();
      const containerCenter = containerRect.top + containerRect.height / 2;

      let bestIdx = activeIndex;
      let bestDist = Infinity;

      for (let i = 0; i < itemRefs.current.length; i++) {
        const elItem = itemRefs.current[i];
        if (!elItem) continue;
        const rect = elItem.getBoundingClientRect();
        const itemCenter = rect.top + rect.height / 2;
        const dist = Math.abs(itemCenter - containerCenter);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }

      if (bestIdx !== activeIndex) {
        updateTargetsForActive(bestIdx);
      }
    }

    const onScroll = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        findActiveIndex();
      });
    };

    if (listRef.current) {
      listRef.current.addEventListener("scroll", onScroll, { passive: true });
    }

    findActiveIndex();

    // Store cleanup function
    threeCleanupRef.current = () => {
      isActive = false;
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      
      if (listRef.current)
        listRef.current.removeEventListener("scroll", onScroll);
      
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      
      boxGeometry.dispose();
      meshes.forEach((mesh) => {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        scene.remove(mesh);
      });
      baseMaterial.dispose();
      
      if (renderer) {
        renderer.dispose();
        renderer.forceContextLoss(); // Force cleanup on iOS
        if (renderer.domElement && renderer.domElement.parentNode === el) {
          el.removeChild(renderer.domElement);
        }
      }
    };
  }, [rankedTokens, rankings.length, webglFailed]);

  const getRankDisplay = (rank: number) => {
    const suffixes = ["st", "nd", "rd", "th"];
    const suffix = rank <= 3 ? suffixes[rank - 1] : suffixes[3];
    return { number: rank, suffix };
  };

  if (loading) {
    return (
      <div className="bg-black/30 rounded-lg border border-[#808080]/20 px-6 py-6 lg:min-h-[500px] lg:max-h-[500px] overflow-hidden relative">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center justify-center space-x-2 w-full">
            <div className="w-5 h-5 bg-white/10 rounded-full animate-pulse"></div>
            <h2 className="h-6 bg-white/10 rounded w-32 animate-pulse"></h2>
          </div>
        </div>

        <div className="space-y-6">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="relative h-[70px] rounded-3xl overflow-visible"
            >
              <div className="absolute inset-0 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 z-10" />
              <div className="absolute inset-0 bg-gradient-to-r from-white/5 to-white/10 rounded-2xl" />

              <div className="relative z-20 p-4 h-full">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 w-full">
                    <div className="w-16 h-16 bg-white/10 rounded-full animate-pulse"></div>
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-white/10 rounded animate-pulse w-24"></div>
                      <div className="h-3 bg-white/10 rounded animate-pulse w-16"></div>
                    </div>
                    <div className="space-y-2">
                      <div className="h-4 bg-white/10 rounded animate-pulse w-20"></div>
                      <div className="h-3 bg-white/10 rounded animate-pulse w-12 ml-auto"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  itemRefs.current = [];

  // ReactBits-style interactive depth: centered cards stay sharp while the wheel
  // softly tilts surrounding rows back into the panel.
  React.useEffect(() => {
    if (!listRef.current) return;
    const container = listRef.current;
    let rafId = 0;

    const state: Array<{
      rotateX: number;
      scale: number;
      translateZ: number;
      opacity: number;
      zIdx: number;
    }> = Array.from({ length: Math.max(1, itemRefs.current.length) }).map(
      () => ({
        rotateX: 0,
        scale: 1,
        translateZ: 0,
        opacity: 1,
        zIdx: 1000,
      })
    );

    const smoothing = 0.08;

    const step = () => {
      const containerHeight = container.clientHeight || 1;
      const scrollTop = container.scrollTop;
      const centerOffset = isMobile ? containerHeight * 0.06 : containerHeight * 0.12;
      const center = scrollTop + containerHeight / 2 - centerOffset;

      const speed = scrollVelocityRef.current;
      const speedFactor = Math.min(speed / 1.2, 1); // 0..1
      const dampen = 1 - speedFactor * 0.7;

      const maxRotateX = (isMobile ? 12 : 18) * dampen;
      const minScale = (isMobile ? 0.88 : 0.82) + (1 - dampen) * 0.06;
      const maxTranslateZ = (isMobile ? -34 : -55) * dampen;
      const minOpacity = (isMobile ? 0.36 : 0.22) + (1 - dampen) * 0.18;

      for (let i = 0; i < itemRefs.current.length; i++) {
        const el = itemRefs.current[i];
        if (!el) continue;

        const itemTop = el.offsetTop;
        const itemHeight = el.offsetHeight;
        const itemCenter = itemTop + itemHeight / 2;

        const distanceFromCenter =
          (itemCenter - center) / (containerHeight / 2);
        const absDistance = Math.abs(distanceFromCenter);

        const clampedDistance = Math.min(absDistance, 1);

        // Focus the closest card, tilt the rest like a "watch" wheel.
        const isFocused = clampedDistance < 0.15;
        const tiltDirection = distanceFromCenter > 0 ? -1 : 1;
        const tiltAmount = Math.pow(clampedDistance, 1.1);
        const targetRotateX = isFocused ? 0 : tiltDirection * tiltAmount * maxRotateX;

        const scaleAmount = 1 - clampedDistance * (1 - minScale);
        const targetScale = isFocused ? (isMobile ? 1.01 : 1.03) : Math.max(minScale, scaleAmount);

        const depthAmount = Math.pow(clampedDistance, 0.9);
        const targetTranslateZ = depthAmount * maxTranslateZ;

        const opacityAmount = 1 - clampedDistance * (1 - minOpacity);
        const targetOpacity = isFocused ? 1 : Math.max(minOpacity, opacityAmount);

        const targetZIdx = Math.round(1000 - absDistance * 500) + (isFocused ? 50 : 0);

        const s = state[i] || {
          rotateX: 0,
          scale: 1,
          translateZ: 0,
          opacity: 1,
          zIdx: 1000,
        };

        s.rotateX += (targetRotateX - s.rotateX) * smoothing;
        s.scale += (targetScale - s.scale) * smoothing;
        s.translateZ += (targetTranslateZ - s.translateZ) * smoothing;
        s.opacity += (targetOpacity - s.opacity) * smoothing;
        s.zIdx = targetZIdx;

        el.style.willChange = "transform, opacity";
        el.style.transform = `
          perspective(1000px)
          translateZ(${s.translateZ}px)
          rotateX(${s.rotateX}deg)
          scale(${s.scale})
        `;
        el.style.opacity = `${s.opacity}`;
        el.style.zIndex = `${s.zIdx}`;
        el.style.pointerEvents = s.opacity > 0.3 ? "auto" : "none";
      }

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);

    const findNearestIndex = () => {
      const containerRect = container.getBoundingClientRect();
      const containerCenter = containerRect.top + containerRect.height / 2;
      let bestIdx = 0;
      let bestDist = Infinity;

      for (let i = 0; i < itemRefs.current.length; i++) {
        const el = itemRefs.current[i];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        const itemCenter = rect.top + rect.height / 2;
        const dist = Math.abs(itemCenter - containerCenter);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }
      return bestIdx;
    };

    const onScroll = () => {
      const now = performance.now();
      const last = lastScrollRef.current;
      const currentTop = container.scrollTop;
      const dt = now - last.time;
      const dy = Math.abs(currentTop - last.top);
      scrollVelocityRef.current = dt > 0 ? dy / dt : 0;
      lastScrollRef.current = { top: currentTop, time: now };

      if (snapTimeoutRef.current) {
        window.clearTimeout(snapTimeoutRef.current);
      }
      snapTimeoutRef.current = window.setTimeout(() => {
        const idx = findNearestIndex();
        const target = itemRefs.current[idx];
        if (!target) return;
        const offset =
          target.offsetTop -
          container.clientHeight / 2 +
          target.offsetHeight / 2;
        container.scrollTo({ top: Math.max(0, offset), behavior: "smooth" });
        scrollVelocityRef.current = 0;
      }, 120);
    };

    container.addEventListener("scroll", onScroll, { passive: true });

    const onResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(step);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(rafId);
      container.removeEventListener("scroll", onScroll);
      if (snapTimeoutRef.current) {
        window.clearTimeout(snapTimeoutRef.current);
      }
      window.removeEventListener("resize", onResize);
    };
  }, [isMobile, rankings.length]);

  React.useEffect(() => {
    const container = listRef.current;
    if (!container) return;

    const adjustPadding = () => {
      const containerHeight = container.clientHeight;
      if (!containerHeight) return;
      const referenceItem = itemRefs.current.find(Boolean);
      const itemHeight = referenceItem?.offsetHeight ?? 70;
      const padding = Math.max((containerHeight - itemHeight) / 2, 0);
      container.style.paddingTop = `${padding}px`;
      container.style.paddingBottom = `${padding}px`;
    };

    adjustPadding();
    window.addEventListener("resize", adjustPadding);
    return () => window.removeEventListener("resize", adjustPadding);
  }, [rankings.length]);

  const START_INDEX = 1;

  React.useEffect(() => {
    if (!listRef.current) return;
    const container = listRef.current;
    const groupSize = rankings.length || 1;
    const middleGroup = Math.floor(RANKING_REPEAT_GROUPS / 2);
    const indexInGroup = Math.min(START_INDEX, groupSize - 1);
    const maxIndex = Math.max(itemRefs.current.length - 1, 0);
    const desiredIndex = Math.min(
      middleGroup * groupSize + indexInGroup,
      maxIndex
    );

    const alignStart = () => {
      const target = itemRefs.current[desiredIndex];
      if (!target) return;
      const offset =
        target.offsetTop - container.clientHeight / 2 + target.offsetHeight / 2;
      container.scrollTop = Math.max(0, offset);
    };

    let rafId = 0;
    const waitForItem = () => {
      alignStart();
      if (!itemRefs.current[desiredIndex]) {
        rafId = requestAnimationFrame(waitForItem);
      }
    };

    rafId = requestAnimationFrame(waitForItem);
    return () => cancelAnimationFrame(rafId);
  }, [rankings.length]);

  return (
    <div className="bg-black/30 rounded-lg border border-[#808080]/20 px-3 sm:px-5 md:px-12 py-5 md:py-6 lg:min-h-[500px] lg:max-h-[500px] overflow-hidden relative">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center justify-center space-x-2 w-full">
          <Image src="/startRanking.png" width={14} height={14} alt="star" />
          <h2 className="text-white text-[1.4rem] font-medium">Hot Pairs</h2>
        </div>
      </div>

      {/* Three.js Container - Hidden if WebGL fails */}
      {!webglFailed && (
        <div
          ref={threeRef}
          className="absolute inset-0 z-0 pt-[-100px] pointer-events-none"
          style={{ 
            transform: 'translateZ(0)', // Force hardware acceleration on iOS
            WebkitTransform: 'translateZ(0)'
          }}
        />
      )}
      
      {/* CSS Fallback Background when WebGL fails */}
      {webglFailed && (
        <div className="absolute inset-0 z-0 opacity-30">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-blue-900/20 to-green-900/20" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl" />
        </div>
      )}

      <div
        ref={listRef}
        className="h-[420px] sm:h-[460px] md:h-[500px] overflow-y-scroll no-scrollbar space-y-4 sm:space-y-5 relative z-10 overscroll-contain"
        style={{
          perspective: "1400px",
          transformStyle: "preserve-3d",
          scrollBehavior: "smooth",
          WebkitOverflowScrolling: "touch", // Smooth scrolling on iOS
        }}
      >
        {Array.from({ length: RANKING_REPEAT_GROUPS }).flatMap((_, groupIdx) =>
          rankings.map((item, index) => {
            const keyIndex = groupIdx * rankings.length + index;
            return (
              <div
                key={`${keyIndex}-${item.id}`}
                ref={(el) => {
                  itemRefs.current[keyIndex] = el;
                }}
                onPointerMove={handleCardPointerMove}
                onPointerLeave={handleCardPointerLeave}
                className={`group relative h-[68px] sm:h-[70px] rounded-3xl overflow-visible transition duration-300 ease-out will-change-transform hover:shadow-[0_25px_60px_rgba(15,23,42,0.55)] hover:brightness-110 ${
                  index === 0 ? "shadow-[0_0_30px_5px_rgba(239,68,68,0.3)]" : ""
                } `}
                style={
                  {
                    transformStyle: "preserve-3d",
                    backfaceVisibility: "visible",
                    transformOrigin: "center center",
                    // iOS performance optimization
                    WebkitBackfaceVisibility: "visible",
                    "--ranking-spotlight-color":
                      index === 0
                        ? "255, 178, 84"
                        : index === 1
                        ? "66, 245, 195"
                        : index === 2
                        ? "229, 154, 239"
                        : "173, 173, 173",
                  } as RankingCardStyle
                }
              >
                {/* Glass border effect */}
                <div
                  className={`absolute inset-0 bg-gradient-to-r from-white/5 to-white/10 backdrop-blur-sm rounded-2xl border border-white/10 z-10 ${
                    index === 0
                      ? "shadow-[0_0_56px_2px_rgba(239,68,68,0.5)]"
                      : ""
                  }`}
                  style={index === 0 ? { transform: "translateZ(0)" } : {}}
                />

                {/* Main gradient background */}
                <div
                  className={`absolute inset-0 bg-gradient-to-r ${item.color} rounded-2xl`}
                />

                <div
                  className="absolute inset-0 z-[12] rounded-2xl opacity-[var(--ranking-spotlight-opacity,0)] transition-opacity duration-300 pointer-events-none mix-blend-screen"
                  style={
                    {
                      background:
                        "radial-gradient(220px circle at var(--ranking-spotlight-x,50%) var(--ranking-spotlight-y,50%), rgba(var(--ranking-spotlight-color),0.34), rgba(var(--ranking-spotlight-color),0.12) 34%, transparent 68%)",
                    } as RankingCardStyle
                  }
                />

                <div className="absolute inset-0 z-[13] rounded-2xl opacity-0 transition-opacity duration-500 pointer-events-none group-hover:opacity-100">
                  <div className="absolute -inset-y-8 -left-1/2 w-1/2 rotate-12 bg-gradient-to-r from-transparent via-white/20 to-transparent blur-[1px] transition-transform duration-700 ease-out group-hover:translate-x-[340%]" />
                </div>

                <div className="relative z-20 px-4 py-3 h-full">
                  {/* <div className="flex items-center justify-between text-[0.65rem] uppercase tracking-[0.4em] text-white/70 mb-2">
                    <span className="flex items-center gap-2 font-semibold">
                      <span className="w-2 h-2 rounded-full bg-gradient-to-r from-orange-400 via-orange-200 to-rose-400 animate-pulse" />
                      Rank {item.rank}
                    </span>
                    <span className="text-white/40 tracking-[0.35em]">Assets</span>
                  </div> */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-3 w-full">
                      <span className="relative">
                        <span
                          className={`text-[7.6rem] sm:text-[8.5rem] font-normal absolute top-[-98px] sm:top-[-110px] left-[-2px] sm:left-[0px] md:left-[30px] z-20 bg-clip-text text-transparent bg-gradient-to-b ${item.textGradient}`}
                        >
                          {item.rank}
                        </span>
                        <span
                          className={`absolute z-20 bg-clip-text text-transparent bg-gradient-to-b ${
                            item.textGradient
                          } ${
                            item.rank === 1
                              ? "text-[1.95rem] sm:text-[2.2rem] left-[39px] sm:left-[45px] md:left-[70px] top-[-6px] sm:top-[-9px]"
                              : item.rank === 2
                              ? "text-[1.8rem] sm:text-[2rem] left-[58px] sm:left-[65px] md:left-[85px] top-[-8px] sm:top-[-11px]"
                              : item.rank === 3
                              ? "text-[1.6rem] sm:text-[1.8rem] left-[62px] sm:left-[70px] md:left-[100px] top-[0px] sm:top-[-2px]"
                              : item.rank === 4
                              ? "text-[1.45rem] sm:text-[1.6rem] left-[70px] sm:left-[80px] md:left-[110px] top-[0px] sm:top-[-2px]"
                              : "text-[1.4rem] sm:text-[1.5rem] left-[70px] sm:left-[80px] md:left-[105px] top-[0px] sm:top-[-2px]"
                          }`}
                        >
                          {getRankDisplay(item.rank).suffix}
                        </span>
                      </span>
                      <div className="flex items-center w-full">
                        <div className="flex items-center justify-between ml-[6.5rem] sm:ml-28 md:ml-36 w-full gap-3">
                          <div className="flex min-w-0 items-center space-x-2.5 sm:space-x-3">
                            {item.image ? (
                              <Image
                                src={item.image}
                                width={40}
                                height={40}
                                className="rounded-full w-9 h-9 sm:w-10 sm:h-10"
                                alt="Token Image"
                                // iOS image optimization
                                loading={keyIndex < 10 ? "eager" : "lazy"}
                              />
                            ) : (
                              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-black/50 animate-pulse"></div>
                            )}
                            <div className="text-white text-[0.95rem] sm:text-[1.1rem] flex min-w-0 flex-col justify-start gap-0 font-medium">
                              <span className="flex items-center gap-1 truncate max-w-[5.5rem] sm:max-w-none">
                                {item.symbol}
                              </span>
                              <span className="text-[#CECECE] text-xs font-normal">
                                {" "}
                                / ZIG
                              </span>
                            </div>
                          </div>
                          <div className="shrink-0 text-[0.68rem] sm:text-xs font-normal text-white flex flex-col items-end">
                            <div className="tabular-nums">{item.current_price.toFixed(6)}</div>
                            <div>
                              {item.id?.startsWith("ibc/") ? (
                                <span className="text-gray-400">-</span>
                              ) : (
                                <span
                                  className={
                                    item.price_change_percentage_24h >= 0
                                      ? "text-green-400"
                                      : "text-red-400"
                                  }
                                >
                                  {item.price_change_percentage_24h.toFixed(2)}%
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Background pattern */}
                <div className="absolute top-0 right-0 w-20 h-20 opacity-10">
                  <svg viewBox="0 0 100 100" className="w-full h-full">
                    <path
                      d="M20,20 L80,20 L80,80 L20,80 Z"
                      fill="none"
                      stroke="white"
                      strokeWidth="2"
                    />
                    <path
                      d="M30,40 L70,40 M30,50 L70,50 M30,60 L70,60"
                      stroke="white"
                      strokeWidth="1"
                    />
                  </svg>
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-[150px] z-20 bg-gradient-to-t from-black/90 to-transparent pointer-events-none" />
    </div>
  );
};

export default RankingComponent;
