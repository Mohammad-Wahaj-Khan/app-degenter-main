'use client';

import { useEffect, useMemo, useState, useCallback } from "react";
import { WalletStatus } from "@cosmos-kit/core";
import type { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { TWAP_CONTRACT_ADDRESS, zigChainConfig } from "./constants";
import { useWallet } from "./useWallet";
import {
  getExecuteClient,
  getQueryClient,
  TwapContractQueryClient,
} from "./twapClient";

export function useTwapClients() {
  const wallet = useWallet();
  const {
     address,
     status,
     getSigningCosmWasmClient,
   } = wallet;

  const rpcEndpoint = useMemo(() => {
    return (
      process.env.RPC_URL_DEGENTER ||
      zigChainConfig.apis?.rpc?.[0]?.address ||
      ""
    );
  }, []);

  const contractAddress = TWAP_CONTRACT_ADDRESS || "zig17stc6s6sdhsku6s6cyldqc04ge0a0rk7z0qwzpp9effzx9g29e8s7lqe40";

  const [signingClient, setSigningClient] = useState<SigningCosmWasmClient | null>(
    null,
  );
  const [signingError, setSigningError] = useState<Error | null>(null);
  const [signingLoading, setSigningLoading] = useState(false);

  const [queryClient, setQueryClient] = useState<TwapContractQueryClient | null>(
    null,
  );
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
        const client = await getSigningCosmWasmClient();
        if (!cancelled) {
          const castClient = client as unknown as SigningCosmWasmClient;
          setSigningClient(castClient);
          setSigningError(null);
          setQueryClient(getQueryClient(castClient, contractAddress));
          setQueryError(null);
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
  }, [address, status, getSigningCosmWasmClient, contractAddress]);

  const getExecuteClientInstance = useCallback(async () => {
    if (!address) {
      throw new Error("Wallet address not available.");
    }
    const signing = (signingClient ?? (await getSigningCosmWasmClient())) as unknown as SigningCosmWasmClient;
    return getExecuteClient(
      signing,
      address,
      contractAddress,
    );
  }, [address, getSigningCosmWasmClient, signingClient, contractAddress]);

  return {
    rpcEndpoint,
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
