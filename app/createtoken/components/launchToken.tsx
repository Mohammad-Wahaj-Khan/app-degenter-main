"use client";

import { useRef, useState, type ChangeEvent, useEffect } from "react";
import { Check, Globe, Send, X, Sparkles, Upload, Zap } from "lucide-react";
import { useChain } from "@cosmos-kit/react";
import { GasPrice, SigningStargateClient, calculateFee } from "@cosmjs/stargate";
import { Registry } from "@cosmjs/proto-signing";
import { defaultRegistryTypes } from "@cosmjs/stargate";
import { CHAIN_NAME } from "@/app/config/chain";
import NextImage from "next/image";
import ImageCamera from "@/public/Camera.svg";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { motion, AnimatePresence } from "framer-motion";
import {  Heart, Copy } from "lucide-react";
// Register GSAP plugins
if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const MSG_CREATE_DENOM_TYPE_URL = "/zigchain.factory.MsgCreateDenom";
const MSG_SET_METADATA_TYPE_URL = "/zigchain.factory.MsgSetDenomMetadata";
const MSG_MINT_AND_SEND_TYPE_URL = "/zigchain.factory.MsgMintAndSendTokens";
const TOKEN_LAUNCH_FEE_ZIG = 210;
const TOKEN_LAUNCH_FEE_UZIG = String(TOKEN_LAUNCH_FEE_ZIG * 1_000_000);
const TOKEN_CREATE_MEMO = "Created from degenter.io";

const passThroughType = {
  create: (base: Uint8Array) => base,
  fromPartial: (object: Uint8Array) => object,
  encode: (message: Uint8Array) => ({
    finish: () => message,
  }),
  decode: () => ({}),
} as any;

const zigRegistry: any = new Registry([
  ...defaultRegistryTypes,
  [MSG_CREATE_DENOM_TYPE_URL, passThroughType],
  [MSG_SET_METADATA_TYPE_URL, passThroughType],
  [MSG_MINT_AND_SEND_TYPE_URL, passThroughType],
]);

// Particle Background Component
function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      alpha: number;
      color: string;
    }> = [];

    const colors = ["#39d6bd", "#ff6947", "#56f0d4", "#ff7a54"];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    const createParticle = () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      size: Math.random() * 2 + 1,
      alpha: Math.random() * 0.5 + 0.2,
      color: colors[Math.floor(Math.random() * colors.length)],
    });

    const init = () => {
      resize();
      particles = Array.from({ length: 50 }, createParticle);
    };

    const animate = () => {
      ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fill();
        ctx.globalAlpha = 1;
      });

      // Draw connections
      particles.forEach((p1, i) => {
        particles.slice(i + 1).forEach((p2) => {
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 150) {
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = "#39d6bd";
            ctx.globalAlpha = (1 - dist / 150) * 0.2;
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        });
      });

      animationId = requestAnimationFrame(animate);
    };

    init();
    animate();

    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0"
      style={{ background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0f0f1e 100%)" }}
    />
  );
}

// Animated Gradient Orb
function GradientOrb() {
  const orbRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!orbRef.current) return;

    gsap.to(orbRef.current, {
      x: "random(-100, 100)",
      y: "random(-100, 100)",
      scale: "random(0.8, 1.2)",
      duration: "random(10, 20)",
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
    });
  }, []);

  return (
    <div
      ref={orbRef}
      className="pointer-events-none fixed -right-40 top-1/4 h-[600px] w-[600px] rounded-full opacity-30 blur-[120px]"
      style={{
        background: "radial-gradient(circle, rgba(255,105,71,0.4) 0%, rgba(86,240,212,0.2) 50%, transparent 70%)",
      }}
    />
  );
}

export default function LaunchToken() {
  const { address, connect, getOfflineSignerDirect } = useChain(CHAIN_NAME);
  const LCD_URL =
    process.env.LCD_URL_DEGENTER ||
    process.env.NEXT_PUBLIC_LCD_URL_DEGENTER ||
    process.env.NEXT_PUBLIC_LCD_URL_DEGEN ||
    "";
  const RPC_URL =
    process.env.RPC_URL_DEGENTER ||
    process.env.NEXT_PUBLIC_RPC_URL_DEGENTER ||
    process.env.NEXT_PUBLIC_RPC_URL_DEGEN ||
    "";
  const normalizedRpcUrl =
    /^https?:\/\//i.test(RPC_URL) || /^wss?:\/\//i.test(RPC_URL)
      ? RPC_URL
      : RPC_URL
        ? `https://${RPC_URL}`
        : "";
  const TOKEN_LAUNCH_FEE_RECEIVER =
    process.env.NEXT_PUBLIC_TOKEN_LAUNCH_FEE_RECEIVER || "";
  const MIN_MINTING_CAP = 1000;
  const DESCRIPTION_MAX_LENGTH = 300;
  const MAX_NAME_SYMBOL_LENGTH = 20;
  const IMAGE_RATIO_TOLERANCE = 0.02;
  const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/jpg"];

  const isSquareImage = (width: number, height: number) =>
    height === 0 ? false : Math.abs(width / height - 1) <= IMAGE_RATIO_TOLERANCE;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState("");
  const [createdDenom, setCreatedDenom] = useState("");
  const [denomCopied, setDenomCopied] = useState(false);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [metadataCheck, setMetadataCheck] = useState("");
  const [activeSocial, setActiveSocial] = useState<"x" | "telegram" | "website" | null>(null);
  const [imageError, setImageError] = useState("");

  // Refs for animations
  const containerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLDivElement>(null);
  const uploadRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const inputsRef = useRef<(HTMLInputElement | HTMLTextAreaElement)[]>([]);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const socialsRef = useRef<HTMLDivElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState({
    tokenName: "",
    tokenSymbol: "",
    tokenDescription: "",
    twitter: "",
    telegram: "",
    website: "",
    mintingCap: "",
    canChangeMintingCap: true,
  });

  // Entrance animations
  useEffect(() => {
    const ctx = gsap.context(() => {
      // Title animation
      gsap.fromTo(
        titleRef.current,
        { opacity: 0, y: -50, scale: 0.9 },
        { opacity: 1, y: 0, scale: 1, duration: 1, ease: "power3.out" }
      );

      // Subtitle stagger
      gsap.fromTo(
        subtitleRef.current?.children || [],
        { opacity: 0, x: -30 },
        { opacity: 1, x: 0, duration: 0.8, stagger: 0.2, delay: 0.3, ease: "power2.out" }
      );

      // Upload container 3D flip
      gsap.fromTo(
        uploadRef.current,
        { opacity: 0, rotateY: -90, scale: 0.8 },
        { opacity: 1, rotateY: 0, scale: 1, duration: 1.2, delay: 0.5, ease: "back.out(1.7)" }
      );

      // Form inputs stagger with elastic effect
      gsap.fromTo(
        inputsRef.current,
        { opacity: 0, y: 40, scale: 0.95 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.6,
          stagger: 0.1,
          delay: 0.8,
          ease: "elastic.out(1, 0.5)",
        }
      );

      // Socials bounce in
      gsap.fromTo(
        socialsRef.current?.children || [],
        { opacity: 0, scale: 0, rotation: -180 },
        {
          opacity: 1,
          scale: 1,
          rotation: 0,
          duration: 0.8,
          stagger: 0.15,
          delay: 1.2,
          ease: "back.out(2)",
        }
      );

      // Button pulse animation
      gsap.to(buttonRef.current, {
        boxShadow: "0 0 40px rgba(57, 214, 189, 0.6)",
        duration: 1.5,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  // Magnetic button effect
  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;

    gsap.to(btn, {
      x: x * 0.3,
      y: y * 0.3,
      duration: 0.3,
      ease: "power2.out",
    });
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    gsap.to(e.currentTarget, {
      x: 0,
      y: 0,
      duration: 0.5,
      ease: "elastic.out(1, 0.3)",
    });
  };

  // Image upload animation
  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setImageError("Please select a valid PNG, JPEG, or GIF image.");
      setImageFile(null);
      setImagePreview(null);
      return;
    }

    const fileType = file.type.toLowerCase();
    if (!ALLOWED_IMAGE_TYPES.includes(fileType)) {
      setImageError("Please select a valid PNG, JPEG, or GIF image.");
      setImageFile(null);
      setImagePreview(null);
      return;
    }

    setImageError("");

    const reader = new FileReader();
    reader.onloadend = () => {
      const preview = reader.result as string;
      const testImage = new Image();
      testImage.onload = () => {
        if (!isSquareImage(testImage.width, testImage.height)) {
          setImageError("Token image must use a square (1:1) aspect ratio.");
          setImageFile(null);
          setImagePreview(null);
          return;
        }

        setImageFile(file);
        setImagePreview(preview);

        // Animate image appearance once the DOM updates
        requestAnimationFrame(() => {
          if (!imageContainerRef.current) return;
          gsap.fromTo(
            imageContainerRef.current,
            { scale: 0, rotation: -180, opacity: 0 },
            { scale: 1, rotation: 0, opacity: 1, duration: 0.8, ease: "back.out(2)" }
          );
        });
      };
      testImage.onerror = () => {
        setImageError("Unable to read the uploaded image.");
        setImageFile(null);
        setImagePreview(null);
      };
      testImage.src = preview;
    };
    reader.readAsDataURL(file);
  };

  // Input focus animations
  const handleInputFocus = (index: number) => {
    gsap.to(inputsRef.current[index], {
      scale: 1.02,
      boxShadow: "0 0 30px rgba(57, 214, 189, 0.3)",
      borderColor: "#39d6bd",
      duration: 0.3,
      ease: "power2.out",
    });
  };

  const handleInputBlur = (index: number) => {
    gsap.to(inputsRef.current[index], {
      scale: 1,
      boxShadow: "none",
      borderColor: "rgba(63, 63, 70, 1)",
      duration: 0.3,
      ease: "power2.out",
    });
  };

  // Social icon hover
  const handleSocialHover = (e: React.MouseEvent<HTMLButtonElement>, isEnter: boolean) => {
    gsap.to(e.currentTarget, {
      scale: isEnter ? 1.3 : 1,
      rotation: isEnter ? 360 : 0,
      duration: 0.5,
      ease: isEnter ? "back.out(2)" : "power2.out",
    });
  };

  const toVarint = (num: number) => {
    const out: number[] = [];
    let n = num >>> 0;
    while (n > 127) {
      out.push((n & 127) | 128);
      n >>>= 7;
    }
    out.push(n);
    return out;
  };

  const encStr = (field: number, v: string) => {
    if (!v) return [];
    const b = new TextEncoder().encode(v);
    return [field << 3 | 2, ...toVarint(b.length), ...b];
  };

  const encBool = (field: number, v: boolean) => [field << 3, v ? 1 : 0];
  const encU32 = (field: number, v: number) => [field << 3, ...toVarint(v)];
  const encBytes = (field: number, bytes: Uint8Array) => [field << 3 | 2, ...toVarint(bytes.length), ...bytes];

  const uploadImageToS3 = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/pinata/file", {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || "Image upload failed");
    }
    const data = await res.json();
    return data.url as string;
  };

  const uploadJsonToPinata = async (payload: Record<string, string>) => {
    const res = await fetch("/api/pinata/json", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ payload }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || "Pinata metadata upload failed");
    }
    const data = await res.json();
    return data.url as string;
  };

  const sha256Hex = async (input: string) => {
    const buf = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest))
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
  };

  const verifyDenomMetadata = async (baseDenom: string, displayDenom: string) => {
    try {
      const res = await fetch(
        `${LCD_URL.replace(/\/$/, "")}/cosmos/bank/v1beta1/denom_metadata/${encodeURIComponent(baseDenom)}`
      );
      if (!res.ok) {
        setMetadataCheck("Metadata check: unable to fetch metadata from LCD.");
        return;
      }
      const data = await res.json();
      const metadata = data?.metadata;
      const units = Array.isArray(metadata?.denom_units) ? metadata.denom_units : [];
      const displayUnit = units.find((u: any) => u?.denom === displayDenom);
      const baseUnit = units.find((u: any) => u?.denom === baseDenom);
      const isValid =
        metadata?.base === baseDenom &&
        metadata?.display === displayDenom &&
        Number(baseUnit?.exponent) === 0 &&
        Number(displayUnit?.exponent) === 6;

      setMetadataCheck(
        isValid
          ? "Metadata check: on-chain metadata confirmed (display exponent = 6)."
          : "Metadata check: metadata fetched, but explorer may still show base exponent 0."
      );
    } catch {
      // setMetadataCheck("Metadata check: request failed.");
    }
  };

  const normalizeTwitterHandle = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const withoutProtocol = trimmed.replace(/^https?:\/\//i, "");
    const withoutDomain = withoutProtocol.replace(/^((www\.)?x\.com\/|twitter\.com\/)/i, "");
    const withoutAt = withoutDomain.replace(/^@/, "");
    return withoutAt.split(/[/?#]/)[0].trim();
  };

  const handleCreateToken = async () => {
    setError("");
    setTxHash("");
    setCreatedDenom("");
    setDenomCopied(false);
    setShowSuccessPopup(false);
    setMetadataCheck("");
    if (!agreed) return setError("Please accept Terms of Use.");
    if (!formData.tokenName || !formData.tokenSymbol) {
      return setError("Token name and symbol are required.");
    }
    if (/\s/.test(formData.tokenSymbol)) {
      return setError("Token symbol cannot contain spaces.");
    }
    if (
      formData.tokenName.length > MAX_NAME_SYMBOL_LENGTH ||
      formData.tokenSymbol.length > MAX_NAME_SYMBOL_LENGTH
    ) {
      return setError(`Token name and symbol must be at most ${MAX_NAME_SYMBOL_LENGTH} characters.`);
    }
    if (!/^\d+$/.test(formData.mintingCap)) {
      return setError("Minting cap must be a positive whole number.");
    }
    const mintingCapValue = Number(formData.mintingCap);
    if (mintingCapValue < MIN_MINTING_CAP) {
      return setError(`Minting cap must be at least ${MIN_MINTING_CAP.toLocaleString()}.`);
    }
    if (!imageFile) return setError("Please upload an image first.");

    try {
      setIsCreating(true);
      
      // Animate button during creation
      gsap.to(buttonRef.current, {
        scale: 0.95,
        duration: 0.2,
        yoyo: true,
        repeat: -1,
      });

      if (!address) await connect();
      if (!address) throw new Error("Wallet not connected");
      if (!TOKEN_LAUNCH_FEE_RECEIVER) {
        throw new Error("Missing NEXT_PUBLIC_TOKEN_LAUNCH_FEE_RECEIVER in .env");
      }

      const iconUrl = await uploadImageToS3(imageFile);
      const metadata = {
        name: formData.tokenName,
        description: formData.tokenDescription || `${formData.tokenName} token`,
        icon: iconUrl,
        twitter: formData.twitter.trim(),
        telegram: formData.telegram.trim(),
        website: formData.website.trim(),
      };
      const metadataUri = await uploadJsonToPinata(metadata);
      const uriHash = await sha256Hex(metadataUri);
      const subDenom = formData.tokenSymbol.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 30);
      const amount = (BigInt(formData.mintingCap) * BigInt(1_000_000)).toString();

      const createDenomMsg = {
        URI: metadataUri,
        URI_hash: uriHash,
        can_change_minting_cap: formData.canChangeMintingCap,
        creator: address,
        description: formData.tokenDescription || `${formData.tokenName} token`,
        minting_cap: amount,
        sub_denom: subDenom,
      };

      const createDenomBytes = new Uint8Array([
        ...encStr(1, createDenomMsg.creator),
        ...encStr(2, createDenomMsg.sub_denom),
        ...encStr(3, createDenomMsg.minting_cap),
        ...encBool(4, createDenomMsg.can_change_minting_cap),
        ...encStr(5, createDenomMsg.URI),
        ...encStr(6, createDenomMsg.URI_hash),
        ...encStr(7, createDenomMsg.description),
      ]);

      const denom = `coin.${address}.${subDenom}`;
      const baseDenomUnit = new Uint8Array([
        ...encStr(1, denom),
        ...encU32(2, 0),
      ]);
      const displayDenomUnit = new Uint8Array([
        ...encStr(1, subDenom),
        ...encU32(2, 6),
      ]);
      const metadataBytes = new Uint8Array([
        ...encStr(1, createDenomMsg.description),
        ...encBytes(2, baseDenomUnit),
        ...encBytes(2, displayDenomUnit),
        ...encStr(3, denom),
        ...encStr(4, subDenom),
        ...encStr(5, formData.tokenName),
        ...encStr(6, formData.tokenSymbol.toUpperCase()),
        ...encStr(7, metadataUri),
        ...encStr(8, uriHash),
      ]);
      const setMetadataBytes = new Uint8Array([
        ...encStr(1, address),
        ...encBytes(2, metadataBytes),
      ]);
      const tokenCoin = new Uint8Array([
        ...encStr(1, denom),
        ...encStr(2, amount),
      ]);
      const mintBytes = new Uint8Array([
        ...encStr(1, address),
        18,
        ...toVarint(tokenCoin.length),
        ...tokenCoin,
        ...encStr(3, address),
      ]);

      const signer = getOfflineSignerDirect();
      if (!normalizedRpcUrl) throw new Error("Missing RPC URL!");
      const client = await SigningStargateClient.connectWithSigner(normalizedRpcUrl, signer, {
        registry: zigRegistry,
      } as any);
      const fee = calculateFee(350000, GasPrice.fromString("0.03uzig"));
      const result = await client.signAndBroadcast(
        address,
        [
          {
            typeUrl: "/cosmos.bank.v1beta1.MsgSend",
            value: {
              fromAddress: address,
              toAddress: TOKEN_LAUNCH_FEE_RECEIVER,
              amount: [{ denom: "uzig", amount: TOKEN_LAUNCH_FEE_UZIG }],
            },
          },
          { typeUrl: MSG_CREATE_DENOM_TYPE_URL, value: createDenomBytes as any },
          { typeUrl: MSG_SET_METADATA_TYPE_URL, value: setMetadataBytes as any },
          { typeUrl: MSG_MINT_AND_SEND_TYPE_URL, value: mintBytes as any },
        ] as any,
        fee,
        `Create ${formData.tokenSymbol} | ${TOKEN_CREATE_MEMO}`
      );
      if (result.code !== 0) throw new Error(result.rawLog || "Tx failed");
      
      // Success animation
      gsap.killTweensOf(buttonRef.current);
      gsap.to(buttonRef.current, {
        scale: 1.1,
        backgroundColor: "#10b981",
        duration: 0.3,
        ease: "back.out(2)",
      });

      setTxHash(result.transactionHash);
      setCreatedDenom(denom);
      setShowSuccessPopup(true);
      await verifyDenomMetadata(denom, subDenom);
      
      // Reset form with animation
      gsap.to(formRef.current, {
        opacity: 0,
        y: -20,
        duration: 0.5,
        onComplete: () => {
          setFormData({
            tokenName: "",
            tokenSymbol: "",
            tokenDescription: "",
            twitter: "",
            telegram: "",
            website: "",
            mintingCap: "",
            canChangeMintingCap: true,
          });
          setImageFile(null);
          setImagePreview(null);
          setAgreed(false);
          setImageError("");
          gsap.to(formRef.current, { opacity: 1, y: 0, duration: 0.5 });
        },
      });

      fetch(`${LCD_URL}/cosmos/tx/v1beta1/txs/${result.transactionHash}`).catch(() => undefined);
    } catch (e: any) {
      gsap.killTweensOf(buttonRef.current);
      gsap.to(buttonRef.current, {
        scale: 1,
        keyframes: [
          { x: 0 },
          { x: -10 },
          { x: 10 },
          { x: -10 },
          { x: 10 },
          { x: 0 },
        ],
        duration: 0.5,
        ease: "power2.out",
      });
      setError(e?.message || "Failed to create token");
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopyDenom = async () => {
    if (!createdDenom) return;
    try {
      await navigator.clipboard.writeText(createdDenom);
      setDenomCopied(true);
      setTimeout(() => setDenomCopied(false), 1500);
    } catch {
      // Ignore clipboard failures
    }
  };

  return (
    <>
      {/* <ParticleBackground /> */}
      <GradientOrb />
      
      <section ref={containerRef} className="relative min-h-screen overflow-hidden text-white">
        {activeSocial && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-2xl border border-emerald-400/30 bg-zinc-900/90 p-6 shadow-2xl transform transition-all hover:scale-[1.02]">
              <h3 className="text-lg font-semibold text-emerald-300">
                {activeSocial === "x" && "Set X Username"}
                {activeSocial === "telegram" && "Set Telegram"}
                {activeSocial === "website" && "Set Website"}
              </h3>
              <p className="mt-2 text-xs text-zinc-400">
                {activeSocial === "x" && "Enter just your username, no @ or URL."}
                {activeSocial === "telegram" && "Enter your Telegram username or link."}
                {activeSocial === "website" && "Enter your website URL."}
              </p>
              <input
                type="text"
                value={
                  activeSocial === "x"
                    ? formData.twitter
                    : activeSocial === "telegram"
                      ? formData.telegram
                      : formData.website
                }
                onChange={(e) => {
                  const value = e.target.value;
                  setFormData((prev) => ({
                    ...prev,
                    twitter: activeSocial === "x" ? value : prev.twitter,
                    telegram: activeSocial === "telegram" ? value : prev.telegram,
                    website: activeSocial === "website" ? value : prev.website,
                  }));
                }}
                placeholder={
                  activeSocial === "x"
                    ? "https://x.com/username "
                    : activeSocial === "telegram"
                      ? "https://t.me/username "
                      : "https://example.com "
                }
                className="mt-4 h-12 w-full rounded-xl border border-zinc-700 bg-zinc-900/55 px-4 text-sm text-white placeholder:text-zinc-500 focus:border-emerald-400/60 focus:outline-none transition-all focus:shadow-[0_0_20px_rgba(57,214,189,0.3)]"
              />
              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setActiveSocial(null)}
                  className="h-10 rounded-lg border border-zinc-700 px-4 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSocial(null)}
                  className="h-10 rounded-lg bg-emerald-400 px-5 text-sm font-semibold text-black hover:bg-emerald-300 transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
              
      <AnimatePresence>
        {showSuccessPopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Animated Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSuccessPopup(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md" 
            />

            {/* Main Modal */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative w-full max-w-md overflow-hidden rounded-[2.5rem] border border-white/20  p-8 shadow-[0_20px_50px_rgba(236,72,153,0.3)] backdrop-blur-2xl"
            >
              {/* Floating Decorative Orbs */}
              <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-pink-500/20 blur-3xl" />
              <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-indigo-500/20 blur-3xl" />

              <div className="relative z-10">
                {/* Animated Icon Header */}
                <div className="mb-6 flex justify-center">
                  <motion.div 
                    animate={{ 
                      scale: [1, 1.1, 1],
                      rotate: [0, 5, -5, 0] 
                    }}
                    transition={{ repeat: Infinity, duration: 3 }}
                    className="relative h-20 w-20 rounded-full bg-gradient-to-tr from-pink-400 to-indigo-400 p-[2px]"
                  >
                    <div className="flex h-full w-full items-center justify-center rounded-full bg-zinc-900">
                      <Sparkles className="h-10 w-10 text-pink-400" />
                    </div>
                    <motion.div 
                      animate={{ opacity: [0, 1, 0], scale: [0.5, 1.2, 0.5] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                      className="absolute -top-1 -right-1 text-indigo-300"
                    >
                      <Heart fill="currentColor" size={20} />
                    </motion.div>
                  </motion.div>
                </div>

                <h3 className="text-3xl font-black tracking-tight text-center text-transparent bg-clip-text bg-white mb-2">
                  Hurray! Token Created!
                </h3>
                <p className="text-zinc-400 text-center font-medium mb-6">Your masterpiece is officially on the chain ✨</p>

                {createdDenom && (
                  <div className="mb-6 overflow-hidden rounded-2xl bg-white/5 border border-white/10 p-4 transition-all hover:bg-white/10">
                    <p className="text-[10px] uppercase font-bold tracking-[0.2em] text-pink-400/80">Identity / Denom</p>
                    <div className="mt-3 flex items-center gap-3">
                      <code className="flex-1 truncate font-mono text-sm text-indigo-200">
                        {createdDenom}
                      </code>
                      <button
                        type="button"
                        onClick={handleCopyDenom}
                        className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all active:scale-90 ${
                          denomCopied ? "bg-pink-500 text-white" : "bg-white/10 text-pink-300 hover:bg-pink-500/20"
                        }`}
                      >
                        {denomCopied ? <Check size={18} /> : <Copy size={18} />}
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <a
                    href="https://app.oroswap.org/pools"
                    target="_blank"
                    rel="noreferrer"
                    className="group relative flex h-14 w-full items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-r from-pink-500 to-indigo-500 p-[1px] font-bold text-white transition-all hover:shadow-[0_0_20px_rgba(236,72,153,0.5)]"
                  >
                    <div className="flex h-full w-full items-center justify-center rounded-[calc(1rem-1px)] bg-zinc-900 transition-all ">
                      Add Liquidity & Shine
                    </div>
                  </a>

                  <button
                    type="button"
                    onClick={() => setShowSuccessPopup(false)}
                    className="h-12 w-full rounded-2xl font-bold text-zinc-400 hover:text-white transition-colors"
                  >
                    Maybe Later
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!!error && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setError("")}
              className="absolute inset-0 bg-black/70 backdrop-blur-md"
            />

            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative w-full max-w-md overflow-hidden rounded-2xl border border-[#808080]/20 bg-[#050505] shadow-2xl"
            >
              {/* <div
                className="h-24 w-full bg-cover bg-center"
                style={{ backgroundImage: "url('/degenter.png')" }}
              /> */}
              <div className="p-8 text-center">
                <div className="mb-6 flex justify-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5">
                    <X className="h-8 w-8 text-red-400" />
                  </div>
                </div>

                <h3 className="text-2xl font-bold text-white mb-2">Launch Failed</h3>
                <p className="text-zinc-400 mb-6">{error}</p>

                <div className="space-y-3">
                  {error === "Missing RPC URL!" && (
                    <a
                      href="https://testnet.oroswap.org/pools"
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-12 w-full items-center justify-center rounded-lg bg-white text-sm font-semibold text-black hover:bg-white/90 transition-colors"
                    >
                      Launch or add LP from here
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setError("")}
                    className="h-12 w-full rounded-lg border border-white/10 text-sm font-semibold text-zinc-300 hover:text-white hover:border-white/20 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

        <div className="relative z-10 mx-auto py-8 px-8 ">
          <div className="mb-10 flex flex-col items-start justify-between gap-6 md:flex-row">
            <div ref={subtitleRef} className="max-w-2xl">
              <h1 ref={titleRef} className="text-5xl md:text-7xl font-bold tracking-tight bg-gradient-to-r from-emerald-400 via-teal-400 to-orange-400 bg-clip-text text-transparent">
                Create Token
              </h1>
              <p className="mt-6 text-2xl md:text-xl font-medium text-zinc-100">Time to power up your token!</p>
              <p className="mt-2 max-w-2xl text-base leading-relaxed text-zinc-400">
                Upload your image (PNG, JPEG, GIF) and give your token a custom look that&apos;ll stand out in the marketplace.
              </p>
            </div>

            <div ref={uploadRef} className="flex w-full flex-col items-start md:w-auto md:items-center perspective-1000">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="group relative h-[140px] w-[140px] rounded-[30px] p-[4px] transition-transform duration-300 hover:scale-105"
                style={{
                  boxShadow: "0 0 60px rgba(255, 105, 71, 0.4), inset 0 0 20px rgba(86, 240, 212, 0.2)",
                }}
              >
                <div className="absolute inset-0 rounded-[30px] bg-gradient-to-b from-[#ff6947] via-[#ff7a54] to-[#56f0d4] animate-pulse" />
                <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[26px] bg-[radial-gradient(75%_75%_at_50%_30%,rgba(106,23,20,0.9)_0%,rgba(42,8,9,0.95)_100%)]">
                  {imagePreview ? (
                    <div ref={imageContainerRef} className="h-full w-full">
                      <img src={imagePreview} alt="Token" className="h-full w-full object-cover" />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <NextImage src={ImageCamera} alt="Upload" width={40} height={40} className="h-10 w-10 object-contain opacity-80 group-hover:opacity-100 transition-opacity" />
                      {/* <Upload className="h-5 w-5 text-white/60" /> */}
                    </div>
                  )}
                </div>
                
                {/* Floating particles around upload */}
                <div className="absolute -top-2 -right-2 h-3 w-3 rounded-full bg-emerald-400 animate-bounce" />
                <div className="absolute -bottom-2 -left-2 h-2 w-2 rounded-full bg-orange-400 animate-pulse" />
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-4 h-12 rounded-full bg-gradient-to-r from-[#39d6bd] to-[#2dd4bf] px-8 text-sm font-bold text-black shadow-lg hover:shadow-emerald-400/50 transition-all hover:scale-105 flex items-center gap-2"
              >
                <Upload className="h-4 w-4" />
                Upload Image
              </button>
              {imageError && (
                <p className="mt-3 text-xs text-rose-400">{imageError}</p>
              )}
            </div>
          </div>

          <form ref={formRef} className="space-y-6">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label htmlFor="token-name" className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Token Name
                </label>
                <input
                  id="token-name"
                  ref={(el) => { if (el) inputsRef.current[0] = el; }}
                  type="text"
                  placeholder="Token Name"
                  value={formData.tokenName}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      tokenName: e.target.value.slice(0, MAX_NAME_SYMBOL_LENGTH),
                    })
                  }
                  onFocus={() => handleInputFocus(0)}
                  onBlur={() => handleInputBlur(0)}
                  className="h-14 rounded-xl border border-zinc-700 bg-zinc-900/60 px-4 text-sm placeholder:text-zinc-500 focus:border-emerald-400/60 focus:outline-none backdrop-blur-sm transition-all"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="token-symbol" className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Token Symbol
                </label>
                <input
                  id="token-symbol"
                  ref={(el) => { if (el) inputsRef.current[1] = el; }}
                  type="text"
                  placeholder="Token Symbol"
                  value={formData.tokenSymbol}
                  onChange={(e) => {
                    const nextValue = e.target.value.replace(/\s+/g, "").slice(0, MAX_NAME_SYMBOL_LENGTH);
                    setFormData({ ...formData, tokenSymbol: nextValue });
                  }}
                  onFocus={() => handleInputFocus(1)}
                  onBlur={() => handleInputBlur(1)}
                  className="h-14 rounded-xl border border-zinc-700 bg-zinc-900/60 px-4 text-sm placeholder:text-zinc-500 focus:border-emerald-400/60 focus:outline-none backdrop-blur-sm transition-all"
                />
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <label htmlFor="minting-cap" className="font-semibold uppercase tracking-wide text-zinc-400">
                    Minting Cap
                  </label>
                  <span className="text-[11px] font-medium text-emerald-400">Min 1,000</span>
                </div>
                <input
                  id="minting-cap"
                  ref={(el) => { if (el) inputsRef.current[2] = el; }}
                  type="text"
                  placeholder="Minting Cap (eg: 100000)"
                  value={formData.mintingCap}
                  onChange={(e) => setFormData({ ...formData, mintingCap: e.target.value.replace(/[^\d]/g, "") })}
                  onFocus={() => handleInputFocus(2)}
                  onBlur={() => handleInputBlur(2)}
                  className="h-14 rounded-xl border border-zinc-700 bg-zinc-900/60 px-4 text-sm placeholder:text-zinc-500 focus:border-emerald-400/60 focus:outline-none backdrop-blur-sm transition-all"
                />
              </div>
              <div className="flex h-full items-end">
                <label className="flex h-14 w-full items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-900/60 px-4 text-sm text-zinc-300 cursor-pointer hover:bg-zinc-800/60 transition-colors">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={formData.canChangeMintingCap}
                      onChange={(e) => setFormData({ ...formData, canChangeMintingCap: e.target.checked })}
                      className="peer sr-only"
                    />
                    <div className="h-6 w-6 rounded border-2 border-zinc-600 peer-checked:bg-emerald-400 peer-checked:border-emerald-400 transition-all flex items-center justify-center">
                      {formData.canChangeMintingCap && <Check className="h-4 w-4 text-black" />}
                    </div>
                  </div>
                  <span className="select-none">Allow changing minting cap later</span>
                </label>
              </div>
            </div>

            <div className="relative group">
              <div className="mb-2 flex items-center justify-between text-xs text-zinc-400">
                <label htmlFor="token-description" className="font-semibold uppercase tracking-wide">
                  Token Description
                </label>
                <span className="text-[11px] font-medium text-emerald-400">
                  {formData.tokenDescription.length}/{DESCRIPTION_MAX_LENGTH}
                </span>
              </div>
              <textarea
                id="token-description"
                ref={(el) => { if (el) inputsRef.current[3] = el; }}
                rows={6}
                placeholder="Token Description"
                value={formData.tokenDescription}
                onChange={(e) => {
                  const trimmed = e.target.value.slice(0, DESCRIPTION_MAX_LENGTH);
                  setFormData({ ...formData, tokenDescription: trimmed });
                }}
                onFocus={() => handleInputFocus(3)}
                onBlur={() => handleInputBlur(3)}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900/60 px-4 py-4 text-sm placeholder:text-zinc-500 focus:border-emerald-400/60 focus:outline-none backdrop-blur-sm transition-all resize-none"
                maxLength={DESCRIPTION_MAX_LENGTH}
              />
              {/* <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <Sparkles className="h-5 w-5 text-emerald-400/50" />
              </div> */}
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between p-4 rounded-xl bg-zinc-900/30 border border-zinc-800">
              <p className="text-sm text-zinc-300 flex items-center gap-2">
                <Zap className="h-4 w-4 text-emerald-400" />
                Drop your socials (twitter, Telegram, Website) and keep your followers in the loop!
              </p>
              <div ref={socialsRef} className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setActiveSocial("telegram")}
                  onMouseEnter={(e) => handleSocialHover(e, true)}
                  onMouseLeave={(e) => handleSocialHover(e, false)}
                  className="p-3 rounded-full bg-zinc-800 text-zinc-400 hover:text-emerald-400 hover:bg-zinc-700 transition-all"
                  aria-label="Set Telegram"
                >
                  <Send className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSocial("x")}
                  onMouseEnter={(e) => handleSocialHover(e, true)}
                  onMouseLeave={(e) => handleSocialHover(e, false)}
                  className="p-3 rounded-full bg-zinc-800 text-zinc-400 hover:text-emerald-400 hover:bg-zinc-700 transition-all"
                  aria-label="Set X"
                >
                  <X className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSocial("website")}
                  onMouseEnter={(e) => handleSocialHover(e, true)}
                  onMouseLeave={(e) => handleSocialHover(e, false)}
                  className="p-3 rounded-full bg-zinc-800 text-zinc-400 hover:text-emerald-400 hover:bg-zinc-700 transition-all"
                  aria-label="Set Website"
                >
                  <Globe className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              {formData.twitter && (
                <span className="px-3 py-1 rounded-full bg-zinc-800 text-emerald-400 border border-emerald-400/20 animate-fadeIn">
                  X: @{normalizeTwitterHandle(formData.twitter)}
                </span>
              )}
              {formData.telegram && (
                <span className="px-3 py-1 rounded-full bg-zinc-800 text-emerald-400 border border-emerald-400/20 animate-fadeIn">
                  TG: {formData.telegram}
                </span>
              )}
              {formData.website && (
                <span className="px-3 py-1 rounded-full bg-zinc-800 text-emerald-400 border border-emerald-400/20 animate-fadeIn">
                  Web: {formData.website}
                </span>
              )}
              {!formData.twitter && !formData.telegram && !formData.website && (
                <span className="text-zinc-500 italic">No socials added yet.</span>
              )}
            </div>

            <div className="p-4 rounded-xl bg-gradient-to-r from-zinc-900/60 to-zinc-800/40 border border-zinc-700/50">
              <p className="text-sm text-zinc-300 flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-400 text-xs font-bold">ⓘ</span>
                One time deployment fee of 250 ZIG is required to create your token. This helps cover platform services and ensures a smooth and secure token launch.
              </p>
            </div>

            <div className="flex items-start gap-4 p-4 rounded-xl hover:bg-zinc-900/30 transition-colors cursor-pointer" onClick={() => setAgreed(!agreed)}>
              <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-all duration-300 ${agreed ? "bg-emerald-400 scale-110" : "bg-zinc-700"}`}>
                {agreed && <Check className="h-4 w-4 text-black" />}
              </div>
              <p className="text-sm text-zinc-300 leading-relaxed">
                By launching your token, you agree to DEGENTERMINAL{" "}
                <span className="text-emerald-400 underline underline-offset-2 cursor-pointer hover:text-emerald-300">Terms of Use.</span> It&apos;s your ticket to playing fair and square.
              </p>
            </div>

            <button
              ref={buttonRef}
              type="button"
              onClick={handleCreateToken}
              disabled={isCreating}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              className="relative mt-4 h-14 w-full max-w-[320px] rounded-xl bg-gradient-to-r from-emerald-400 to-teal-400 text-base font-bold text-black disabled:opacity-60 overflow-hidden group"
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                {isCreating ? (
                  <>
                    <div className="h-5 w-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5" />
                    Create Token
                  </>
                )}
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-teal-400 to-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 skew-x-12" />
            </button>
            
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif"
              onChange={handleImageUpload}
              className="hidden"
            />
          </form>
        </div>
      </section>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
        .perspective-1000 {
          perspective: 1000px;
        }
      `}</style>
    </>
  );
}
