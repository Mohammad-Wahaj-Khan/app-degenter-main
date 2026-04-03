"use client";

import { useState, useRef, useEffect } from "react";
import LoadingAnimation from "./components/LoadingAnimation";

export default function LoadingWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [showUI, setShowUI] = useState(false);
  const showTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleAnimationComplete = () => {
    setIsLoaded(true);
    showTimerRef.current = setTimeout(() => setShowUI(true), 100);
  };

  useEffect(() => {
    return () => {
      if (showTimerRef.current) {
        clearTimeout(showTimerRef.current);
      }
    };
  }, []);

  return (
    <>
      {!showUI && (
        <div
          className={`fixed inset-0 z-[100] transition-all duration-[1500ms] cubic-bezier(0.23, 1, 0.32, 1) ${
            isLoaded ? "opacity-0 scale-150 blur-3xl" : "opacity-100 scale-100"
          }`}
        >
          <LoadingAnimation onComplete={handleAnimationComplete} />
        </div>
      )}

      <main
        className={`transition-all duration-[2000ms] ${
          showUI ? "opacity-100 filter-none" : "opacity-0 blur-[50px] scale-95"
        }`}
      >
        {children}
      </main>
    </>
  );
}
