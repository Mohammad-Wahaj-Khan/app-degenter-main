"use client";

import { useChain } from "@cosmos-kit/react";
import { WalletMinimal } from "lucide-react";

export const WalletButton = () => {
  const { connect, disconnect, address, status, openView, wallet } =
    useChain("cosmoshub");

  const formatAddress = (addr: string) => {
    if (!addr) return "";
    return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
  };

  const handleConnect = () => {
    connect();
  };

  const handleDisconnect = () => {
    disconnect();
  };

  if (status === "Connecting") {
    return (
      <button
        disabled
        className="flex items-center gap-2 disabled:opacity-50 text-white px-4 py-2 rounded-lg transition-colors"
      >
        <WalletMinimal size={16} />
        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </button>
    );
  }

  if (status === "Connected") {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-white">
          {formatAddress(address || "")}
        </span>
        <button
          onClick={handleDisconnect}
          className="flex items-center gap-2 text-white px-4 py-2 rounded-lg transition-colors hover:bg-white/10"
          title={`Disconnect ${wallet?.prettyName}`}
        >
          <WalletMinimal size={16} />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleConnect}
      className="flex items-center gap-2 text-white px-4 py-2 rounded-lg transition-colors hover:bg-white/10"
    >
      <WalletMinimal size={16} />
    </button>
  );
};