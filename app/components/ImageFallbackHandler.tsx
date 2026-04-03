"use client";

import { useEffect } from "react";

const FALLBACK_SRC = "/profile.png";

export default function ImageFallbackHandler() {
  useEffect(() => {
    const isBadSrc = (src: string) =>
      !src ||
      src === "null" ||
      src === "undefined" ||
      /(^|[?&])url=(null|undefined)\b/.test(src);

    const applyFallback = (img: HTMLImageElement) => {
      if (img.dataset.fallbackApplied === "1") return;
      const src = img.getAttribute("src") || "";
      if (!isBadSrc(src)) return;

      img.dataset.fallbackApplied = "1";
      img.removeAttribute("srcset");
      img.src = FALLBACK_SRC;
    };

    const handler = (event: Event) => {
      const target = event.target as HTMLImageElement | null;
      if (!target || target.tagName !== "IMG") return;
      if (target.dataset.fallbackApplied === "1") return;
      if (target.src && target.src.includes(FALLBACK_SRC)) return;

      target.dataset.fallbackApplied = "1";
      target.removeAttribute("srcset");
      target.src = FALLBACK_SRC;
    };

    const scan = () => {
      document.querySelectorAll("img").forEach((img) =>
        applyFallback(img as HTMLImageElement)
      );
    };

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes") {
          const target = mutation.target as HTMLImageElement;
          if (target.tagName === "IMG") {
            applyFallback(target);
          }
          continue;
        }
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLImageElement) {
            applyFallback(node);
          } else if (node instanceof HTMLElement) {
            node.querySelectorAll("img").forEach((img) =>
              applyFallback(img as HTMLImageElement)
            );
          }
        });
      }
    });

    window.addEventListener("error", handler, true);
    scan();
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "srcset"],
    });
    return () => {
      window.removeEventListener("error", handler, true);
      observer.disconnect();
    };
  }, []);

  return null;
}
