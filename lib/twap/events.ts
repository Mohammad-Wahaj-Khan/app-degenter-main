"use client";

export const TWAP_CHUNK_EVENT = "degenter.twap.chunk.event";

export type TwapChunkEventDetail = {
  status: "success" | "failure";
  completed?: number;
  total?: number;
  txHash?: string | null;
};

export const dispatchTwapChunkEvent = (detail: TwapChunkEventDetail): void => {
  if (typeof window === "undefined" || !window.dispatchEvent) return;
  const event = new CustomEvent(TWAP_CHUNK_EVENT, { detail });
  window.dispatchEvent(event);
};
