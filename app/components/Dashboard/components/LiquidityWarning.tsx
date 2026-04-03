"use client";

import { AlertTriangle } from "lucide-react";
import React from "react";

export interface LiquidityCheckedToken {
  liquidity?: number;
  total_volume?: number;
  market_cap?: number;
}

export const LIQUIDITY_WARNING_THRESHOLD = 1000;

export const getLiquidityValue = (token: LiquidityCheckedToken) =>
  token.liquidity ??
  Math.max(token.total_volume ?? 0, token.market_cap ?? 0);

export const hasLowLiquidity = (token: LiquidityCheckedToken) =>
  getLiquidityValue(token) < LIQUIDITY_WARNING_THRESHOLD;

interface LowLiquidityBadgeProps {
  className?: string;
  tooltipText?: string;
}

const LowLiquidityBadge: React.FC<LowLiquidityBadgeProps> = ({
  className = "",
  tooltipText = "Low liquidity",
}) => (
  <span
    className={`inline-flex items-center gap-1 text-xs text-orange-400 relative group ${className}`}
    aria-label={tooltipText}
  >
    <AlertTriangle className="w-4 h-4 text-orange-400" aria-hidden="true" />
    <span
      className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-2 py-1 text-[10px] opacity-0 transition-opacity duration-150 group-hover:opacity-100"
      role="tooltip"
    >
      {tooltipText}
    </span>
  </span>
);

export default LowLiquidityBadge;
