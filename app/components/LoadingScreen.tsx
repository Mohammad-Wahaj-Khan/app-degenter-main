"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import LOGO from "../../public/degenterminalLogo.svg";

export default function LoadingScreen() {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
    }, 2000); // Show for 2 seconds

    return () => clearTimeout(timer);
  }, []);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-8">
        {/* Logo */}
        <div className="">
          <Image
            src={LOGO}
            alt="DEGEN Terminal"
            width={200}
            height={40}
            className="opacity-80"
            priority
          />
        </div>

        {/* Loading text */}
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce"></div>
            <div
              className="w-2 h-2 bg-white/60 rounded-full animate-bounce"
              style={{ animationDelay: "0.1s" }}
            ></div>
            <div
              className="w-2 h-2 bg-white/60 rounded-full animate-bounce"
              style={{ animationDelay: "0.2s" }}
            ></div>
          </div>
          {/* <span className="text-white/80 text-lg font-medium">Loading</span> */}
        </div>
      </div>
    </div>
  );
}
