"use client";

import React from "react";
import { ChainProvider } from "@cosmos-kit/react";
import { wallets as keplrWallets } from "@cosmos-kit/keplr";
import { wallets as leapWallets } from "@cosmos-kit/leap";
import "@interchain-ui/react/styles";

// Re-export the chain name so client components (Navbar) can reuse it
export const CHAIN_NAME = "zigchain-1";

// Minimal ZigChain Testnet config (tweak endpoints if you have better ones)
const chains = [
  {
    chain_name: "zigchain-1",
    chain_type: "cosmos",
    status: "live",
    network_type: "mainnet",
    pretty_name: "Zigchain",
    chain_id: "zigchain-1",
    bech32_prefix: "zig",
    slip44: 118,
    apis: {
      rpc: ["https://zigchain-rpc.degenter.io"],
      rest: ["https://zigchain-lcd.degenter.io"],
    },
    fees: { fee_tokens: [{ denom: "uzig" }] },
    staking: { staking_tokens: [{ denom: "uzig" }] },
  },
];

const assetLists = [
  {
    chain_name: "zigchain-1",
    assets: [
      {
        name: "Zig",
        symbol: "ZIG",
        base: "uzig",
        display: "zig",
        denom_units: [
          { denom: "uzig", exponent: 0 },
          { denom: "zig", exponent: 6 },
        ],
      },
    ],
  },
];

// WalletConnect (optional; leave placeholder while testing)
const WC_PROJECT_ID =
  process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "YOUR_WALLETCONNECT_PROJECT_ID";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ChainProvider
      chains={chains as any}
      assetLists={assetLists as any}
      wallets={[...keplrWallets, ...leapWallets]}
      throwErrors={false}
      endpointOptions={{
        isLazy: false,
        endpoints: {
          "zigchain-1": {
            rpc: ["https://zigchain-rpc.degenter.io"],
            rest: ["https://zigchain-lcd.degenter.io"],
            isLazy: false,
          },
        },
      }}
      walletConnectOptions={{
        signClient: {
          projectId: WC_PROJECT_ID,
          relayUrl: "wss://relay.walletconnect.com",
          metadata: {
            name: "Zigchain DEX",
            description: "Zigchain Decentralized Exchange",
            url: "https://degenterminal.com/",
            icons: ["https://www.cryptocomics.cc/assets/logo-BIVGl_Zz.svg"],
          },
        },
      }}
    >
      {children}
    </ChainProvider>
  );
}
