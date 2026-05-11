"use client";

import Link from "next/link";

const formatTransactionHash = (hash: string) => {
  if (!hash) return "";
  return `${hash.substring(0, 8).toUpperCase()}...${hash.substring(hash.length - 4).toUpperCase()}`;
};

export default function Hash({
  value,
  type,
  className = "",
  startLength = 8,
  endLength = 6,
}: {
  value: string;
  type: "tx" | "address" | "block";
  className?: string;
  variant?: "link" | "chip" | "text";
  truncate?: boolean;
  copyable?: boolean;
  href?: string;
  startLength?: number;
  endLength?: number;
  highlighted?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  showTooltip?: boolean;
}) {
  if (!value) return <span className="text-gray-500">—</span>;

  const href =
    type === "tx"
      ? `https://zigscan.org/tx/${value}`
      : type === "address"
        ? `https://zigscan.org/address/${value}`
        : `https://zigscan.org/blocks/${value}`;

  const displayValue =
    type === "tx"
      ? formatTransactionHash(value)
      : `${value.slice(0, startLength)}...${value.slice(-endLength)}`;

  return (
    <Link
      href={href}
      className={`inline-flex items-center text-[#04B7F8] hover:text-[#039fd8] font-medium ${className}`}
    >
      <span className="truncate">{displayValue}</span>
    </Link>
  );
}
