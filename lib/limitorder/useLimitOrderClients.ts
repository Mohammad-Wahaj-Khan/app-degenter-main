"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { WalletStatus } from "@cosmos-kit/core";
import type { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import {
  getExecuteClient,
  getQueryClient,
  type LimitOrderContractQueryClient,
} from "./limitOrderClient";
import { useWallet } from "../twap/useWallet";
import { LIMIT_ORDER_CONTRACT_ADDRESS } from "../twap/constants";

export function useLimitOrderClients() {
  const wallet = useWallet();
  const { address, status, getSigningCosmWasmClient } = wallet;

  const contractAddress =
    LIMIT_ORDER_CONTRACT_ADDRESS ||
    "zig1uynu3zutnn84hsnsqh7y8xrayzqsgdwn2xyhr0dkvxnzcd4xrfgsxdsace";

  const [signingClient, setSigningClient] =
    useState<SigningCosmWasmClient | null>(null);
  const [signingError, setSigningError] = useState<Error | null>(null);
  const [signingLoading, setSigningLoading] = useState(false);

  const [queryClient, setQueryClient] =
    useState<LimitOrderContractQueryClient | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function initSigning() {
      const isReady = status === WalletStatus.Connected && !!address;

      if (!isReady) {
        setSigningClient(null);
        setSigningError(null);
        setSigningLoading(false);
        setQueryClient(null);
        setQueryError(null);
        setQueryLoading(false);
        return;
      }

      setSigningLoading(true);
      setQueryLoading(true);
      try {
        if (!getSigningCosmWasmClient) {
          throw new Error("Wallet does not expose getSigningCosmWasmClient");
        }
        const client = await getSigningCosmWasmClient();
        if (!cancelled) {
          const castClient = client as unknown as SigningCosmWasmClient;
          setSigningClient(castClient);
          setSigningError(null);
          if (!contractAddress || contractAddress.trim() === "") {
            const errorObj = new Error(
              "LIMIT_ORDER_CONTRACT_ADDRESS is not configured. Limit order features are disabled."
            );
            setQueryClient(null);
            setQueryError(errorObj);
          } else {
            setQueryClient(getQueryClient(castClient, contractAddress));
            setQueryError(null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setSigningClient(null);
          const errorObj = err instanceof Error ? err : new Error(String(err));
          setSigningError(errorObj);
          setQueryClient(null);
          setQueryError(errorObj);
        }
      } finally {
        if (!cancelled) {
          setSigningLoading(false);
          setQueryLoading(false);
        }
      }
    }

    initSigning();

    return () => {
      cancelled = true;
    };
  }, [address, status, contractAddress]);

  const getExecuteClientInstance = useCallback(async () => {
    if (!address) {
      throw new Error("Wallet address not available.");
    }
    if (!contractAddress || contractAddress.trim() === "") {
      throw new Error("LIMIT_ORDER_CONTRACT_ADDRESS is not configured.");
    }
    const client =
      signingClient ??
      (getSigningCosmWasmClient ? await getSigningCosmWasmClient() : null);

    if (!client) {
      throw new Error(
        "Signing client not available. Connect wallet and try again."
      );
    }

    return getExecuteClient(
      client as unknown as SigningCosmWasmClient,
      address,
      contractAddress
    );
  }, [address, signingClient, contractAddress, getSigningCosmWasmClient]);

  return {
    contractAddress,
    queryClient,
    queryClientLoading: queryLoading,
    queryClientError: queryError,
    signingClient,
    signingClientError: signingError,
    signingClientLoading: signingLoading,
    getExecuteClient: getExecuteClientInstance,
  };
}
