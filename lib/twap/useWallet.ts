"use client";

import { useMemo } from "react";
import { WalletStatus } from "@cosmos-kit/core";
import { useChain } from "@cosmos-kit/react";
import { ZIG_CHAIN_NAME } from "./constants";

export function useWallet() {
  const chainContext = useChain(ZIG_CHAIN_NAME);
  const { address, status } = chainContext;

  const isConnected = status === WalletStatus.Connected;

  const shortAddress = useMemo(() => {
    if (!address) return undefined;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }, [address]);

  return {
    ...chainContext,
    isConnected,
    shortAddress,
  };
}
