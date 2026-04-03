// Shared chain constants for CosmosKit
export const CHAIN_NAME = "zigchain-1";

// src/config/zigChain.ts
export const zigChain = {
  $schema:
    "https://raw.githubusercontent.com/cosmos/chain-registry/master/chain.schema.json",
  chain_name: "zigchain-1", // <-- this is the *name* you'll pass to useChain()
  status: "live",
  network_type: "mainnet",
  chain_type: "cosmos",
  pretty_name: "ZigChain",
  chain_id: "zigchain-1",
  slip44: 118,
  bech32_prefix: "zig",
  fees: {
    fee_tokens: [
      {
        denom: "uzig",
        fixed_min_gas_price: 0.025,
        low_gas_price: 0.025,
        average_gas_price: 0.03,
        high_gas_price: 0.04,
      },
    ],
  },
  staking: { staking_tokens: [{ denom: "uzig" }] },
  apis: {
    rpc: [{ address: "https://public-zigchain-rpc.numia.xyz/" }], // <-- put your working RPC here
    rest: [{ address: "https://zigchain-mainnet-api.wickhub.cc/" }], // <-- LCD/REST endpoint
  },
  explorers: [],
  // IMPORTANT: include CosmWasm feature or getSigningCosmWasmClient may be undefined
  features: ["cosmwasm"],
} as const;

export const zigAssetList = {
  $schema:
    "https://raw.githubusercontent.com/cosmos/chain-registry/master/assetlist.schema.json",
  chain_name: "zigchain-1",
  assets: [
    {
      description: "ZigChain native token",
      base: "uzig",
      name: "ZIG",
      display: "zig",
      type_asset: "sdk.coin",
      denom_units: [
        { denom: "uzig", exponent: 0 },
        { denom: "zig", exponent: 6 },
      ],
      symbol: "ZIG",
      logo_URIs: {},
    },
  ],
};
