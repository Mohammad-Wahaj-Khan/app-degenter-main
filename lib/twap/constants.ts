"use client";

import { CHAIN_NAME, zigChain } from "@/app/config/chain";

export const ZIG_CHAIN_NAME = CHAIN_NAME as string;
export const ZIG_CHAIN_ID = CHAIN_NAME as string;
export const DEFAULT_BALANCE_DENOM =
  zigChain?.fees?.fee_tokens?.[0]?.denom || "uzig";

export const zigChainConfig = {
  ...zigChain,
  apis: zigChain.apis || {
    rpc: [{ address: "https://rpc.zigscan.net/" }],
    rest: [{ address: "https://zigchain-lcd.degenter.io/" }],
  },
};

export const TWAP_CONTRACT_ADDRESS =
  process.env.TWAP_CONTRACT_ADDRESS ?? "";

export const LIMIT_ORDER_CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_LIMIT_ORDER_CONTRACT_ADDRESS ?? "";

export function assertContractAddress(): string {
  if (!TWAP_CONTRACT_ADDRESS) {
    throw new Error(
      "TWAP_CONTRACT_ADDRESS is not set. Please configure the contract address."
    );
  }
  return TWAP_CONTRACT_ADDRESS;
}
