/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable jsx-a11y/alt-text */
/* eslint-disable @next/next/no-img-element */
"use client";

import { ArrowUpDown, Search, ShieldCheck, X } from "lucide-react";
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import PriceDisplay from "./PriceDisplay";
import { API_HEADERS } from "@/lib/api";

/* =========================
 * Types / helpers
 * ========================= */
type SwapAsset =
  | {
      type: "native";
      denom: string;
      symbol: string;
      icon?: string;
      decimals: number;
    }
  | {
      type: "cw20";
      contract: string;
      symbol: string;
      icon?: string;
      decimals: number;
    };

type TokenListItem = {
  tokenId: string;
  symbol: string;
  name?: string;
  denom: string; // "uzig" | "ibc/..." | factory "coin.zig1...<token>"
  exponent: number; // decimals
  imageUri?: string;
  verified?: boolean; // optional badge
};

type RoutePair = {
  poolId: string;
  pairContract: string;
  pairType?: string; // "xyk" | "stable" | "custom-xxx"
  // optional enriched fields when your API returns them:
  side?: "sell" | "buy";
  price_native?: number; // leg native rate
  price_usd?: number; // leg USD per 1 of leg's "from" token (sell) or per 1 of leg's "to" token (buy) depending on your API
  amount_in?: number;
  amount_out?: number;
  price_impact?: number;
  fee?: number;
};

type Props = {
  apiBase: string;
  tokenSymbol: string;
  tokenDenom: string;
  tokenDecimals: number;
  tokenIcon?: string;
  chainId: string;
  rpcUrl: string;
};

const pow10 = (d: number) => Math.pow(10, d);
const fmt = (n: number, d = 6) =>
  Number.isFinite(n) ? n.toFixed(d) : "0.000000";
const b64 = (obj: unknown) =>
  btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
const isCw20Contract = (s: string) =>
  s.trim().startsWith("zig1") && !s.includes("."); // factory denoms are native
const cleanDenom = (s: string) => s.trim();
const fmtUSD = (n?: number) =>
  Number.isFinite(n as number) ? `$${(n as number).toFixed(2)}` : "$0.00";
const truncMid = (s: string, left = 6, right = 6) =>
  s.length > left + right + 3 ? `${s.slice(0, left)}...${s.slice(-right)}` : s;

const toRouterPairType = (s?: string) => {
  const x = (s || "").trim().toLowerCase();
  if (!x) return { xyk: {} as const };
  if (x.includes("stable")) return { stable: {} as const };
  if (x.startsWith("custom-")) {
    const name = x.slice("custom-".length);
    if (name === "xyk") return { xyk: {} as const };
    if (name) return { custom: name };
  }
  if (x === "xyk" || x.includes("xyk_") || x.includes("xyk-"))
    return { xyk: {} as const };
  return { xyk: {} as const };
};

function parseRouterKeyFromError(msg: string) {
  try {
    const m = msg.match(/key:\s*\[([0-9A-Fa-f,\s]{10,})\]/);
    if (!m) return null;
    const hexes = m[1].split(",").map((s) => s.trim());
    const bytes = hexes.map((h) => {
      const n = parseInt(h, 16);
      return Number.isFinite(n) ? n : 32;
    });
    const ascii = String.fromCharCode(...bytes);
    const start = ascii.indexOf("pair_info");
    if (start >= 0) return ascii.slice(start).replace(/\u0001/g, ".");
    return ascii;
  } catch {
    return null;
  }
}

const ZIG_ICON = "/zigicon.png";
const ROUTER_CONTRACT =
  "zig10jc4vr9vfq0ykkmfvfgz430w8z6hwdlqhmjdy9jypts8wfrrwnnqvp8sgy";
// Fee receiver address from environment variables
const FEE_RECEIVER_ADDRESS =
  process.env.NEXT_PUBLIC_RECEIVER_WALLET_SWAP || process.env.NEXT_PUBLIC_RECEIVER_WALLET_SWAP || "";
if (!FEE_RECEIVER_ADDRESS) {
  console.error("NEXT_PUBLIC_RECEIVER_WALLET_SWAP environment variable is not set");
}
const FEE_PERCENTAGE = 0.0001; // 0.01%
const MEMO = "Traded from degenter.io";

// Function to send 0.05% fee to the receiver
// async function sendFeeToReceiver(
//   client: any,
//   sender: string,
//   receiver: string,
//   amount: string,
//   denom: string,
//   memo: string = "0.05% swap fee"
// ) {
//   try {
//     if (!FEE_RECEIVER_ADDRESS) {
//       console.error(
//         "FEE_RECEIVER_ADDRESS is not set. Skipping fee collection."
//       );
//       return;
//     }

//     // Calculate 0.05% of the amount
//     const amountNum = Number(amount);
//     const feeAmount = Math.floor(amountNum * FEE_PERCENTAGE);

//     if (feeAmount <= 0) return; // Skip if fee is too small

//     const feeMsg = {
//       typeUrl: "/cosmos.bank.v1beta1.MsgSend",
//       value: {
//         fromAddress: sender,
//         toAddress: FEE_RECEIVER_ADDRESS, // Changed from 'receiver' to 'FEE_RECEIVER_ADDRESS'
//         amount: [{ denom, amount: feeAmount.toString() }],
//       },
//     };

//     if (!sender || !FEE_RECEIVER_ADDRESS) {
//       throw new Error(
//         `Invalid addresses - from: ${sender}, to: ${FEE_RECEIVER_ADDRESS}`
//       );
//     }

//     await client.signAndBroadcast(sender, [feeMsg], "auto", memo);
//   } catch (error) {
//     console.error("Error sending fee:", error);
//     // Don't fail the transaction if fee sending fails
//   }
// }

/* =========================
 * Component
 * ========================= */
export default function SwapInterface({
  apiBase,
  tokenSymbol,
  tokenDenom,
  tokenDecimals,
  tokenIcon,
  chainId,
  rpcUrl,
}: Props) {
  // PAGE TOKEN + ZIG baseline
  const ZIG: SwapAsset = {
    type: "native",
    denom: "uzig",
    symbol: "ZIG",
    icon: ZIG_ICON,
    decimals: 6,
  };
  const TOKEN_IS_CW20 = isCw20Contract(tokenDenom);
  const PAGE_TOKEN_INIT: SwapAsset = TOKEN_IS_CW20
    ? {
        type: "cw20",
        contract: tokenDenom.trim(),
        symbol: tokenSymbol,
        icon: tokenIcon,
        decimals: tokenDecimals,
      }
    : {
        type: "native",
        denom: cleanDenom(tokenDenom),
        symbol: tokenSymbol,
        icon: tokenIcon,
        decimals: tokenDecimals,
      };

  /* ----- wallet / balances ----- */
  const [address, setAddress] = useState("");
  const [client, setClient] = useState<any>(null);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [amountIn, setAmountIn] = useState("");
  const [slippageBps, setSlippageBps] = useState(50);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [txHash, setTxHash] = useState("");
  const [showTxAlert, setShowTxAlert] = useState(false);
  const [copied, setCopied] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [direction, setDirection] = useState<"payToReceive" | "receiveToPay">(
    "payToReceive"
  );

  const [tokenList, setTokenList] = useState<TokenListItem[]>([]);
  const [showSlippageModal, setShowSlippageModal] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const slippagePct = useMemo(
    () => (slippageBps / 100).toFixed(2),
    [slippageBps]
  );
  const preset = [0.5, 1, 2, 5];

  function setPct(p: number) {
    const clamped = Math.max(0, Math.min(50, p)); // 0–50%
    setSlippageBps(Math.round(clamped * 100)); // store in bps
    setShowSlippageModal(false);
  }

  // click-outside to close
  useEffect(() => {
    if (!showSlippageModal) return;
    const onDown = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowSlippageModal(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [showSlippageModal]);

  const PAGE_TOKEN = useMemo(() => {
    const t = tokenList.find((x) => {
      if (!TOKEN_IS_CW20) return x.denom === (PAGE_TOKEN_INIT as any).denom;
      return x.symbol?.toUpperCase() === tokenSymbol.toUpperCase();
    });
    if (!t) return PAGE_TOKEN_INIT;
    return {
      ...(PAGE_TOKEN_INIT.type === "native"
        ? { type: "native" as const, denom: t.denom }
        : {
            type: "cw20" as const,
            contract: (PAGE_TOKEN_INIT as any).contract,
          }),
      symbol: t.symbol || PAGE_TOKEN_INIT.symbol,
      icon: PAGE_TOKEN_INIT.icon || t.imageUri,
      decimals: t.exponent ?? PAGE_TOKEN_INIT.decimals,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenList, tokenDenom, tokenSymbol, tokenDecimals, tokenIcon]);

  const [other, setOther] = useState<SwapAsset>({ ...ZIG });

  const [routePairs, setRoutePairs] = useState<RoutePair[]>([]);
  const [priceNative, setPriceNative] = useState<number | undefined>(undefined);
  const [usdPerFrom, setUsdPerFrom] = useState<number | undefined>(undefined);

  const [recvPriceZig, setRecvPriceZig] = useState<number | undefined>(
    undefined
  );
  const [recvPriceUsd, setRecvPriceUsd] = useState<number | undefined>(
    undefined
  );

  // optional independent USD prices (if you expose /prices)
  const [usdPerPay, setUsdPerPay] = useState<number | undefined>(undefined);
  const [usdPerRecv, setUsdPerRecv] = useState<number | undefined>(undefined);

  const [payDDOpen, setPayDDOpen] = useState(false);
  const [recvDDOpen, setRecvDDOpen] = useState(false);

  const activePay: SwapAsset =
    direction === "payToReceive" ? other : PAGE_TOKEN;
  const activeReceive: SwapAsset =
    direction === "payToReceive" ? PAGE_TOKEN : other;

  const fromRef =
    activePay.type === "native"
      ? (activePay as any).denom
      : (activePay as any).contract;
  const toRef =
    activeReceive.type === "native"
      ? (activeReceive as any).denom
      : (activeReceive as any).contract;

  // Shared fetch helper to ensure the required API key header is always sent
  const fetchApi = useCallback(
    (url: string, init: RequestInit = {}) =>
      fetch(url, {
        ...init,
        headers: { ...API_HEADERS, ...(init.headers || {}) },
      }),
    []
  );

  /* =========================
   * Fetch /tokens/swap-list
   * ========================= */
  useEffect(() => {
    (async () => {
      try {
        const r = await fetchApi(`${apiBase}/tokens/swap-list`);
        const j = await r.json();
        const list: TokenListItem[] = Array.isArray(j?.data) ? j.data : [];
        setTokenList(list);
      } catch (e) {
        console.warn("[swap-list] failed", e);
      }
    })();
  }, [apiBase, fetchApi]);

  const keyOf = (a: SwapAsset) => (a.type === "native" ? a.denom : a.contract);
  const iconForDenom = useCallback(
    (denom: string, fallbackSym?: string) =>
      tokenList.find((t) => t.denom === denom)?.imageUri ||
      (fallbackSym?.toUpperCase() === "ZIG" ? ZIG_ICON : PAGE_TOKEN.icon),
    [tokenList, PAGE_TOKEN.icon]
  );

  /* =========================
   * Route poller
   * ========================= */
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runRouteFetch = useCallback(async () => {
    try {
      setErr("");
      const url = `${apiBase}/swap?from=${encodeURIComponent(
        fromRef
      )}&to=${encodeURIComponent(toRef)}`;
      const r = await fetchApi(url);
      const j = await r.json();

      // --- NEW: take mid-USD baselines straight from the API ---
      const baselineFromUsd = Number(j?.data?.usd_baseline?.from_usd);
      const baselineToUsd = Number(j?.data?.usd_baseline?.to_usd);

      setUsdPerPay(
        Number.isFinite(baselineFromUsd) ? baselineFromUsd : undefined
      );
      setUsdPerRecv(Number.isFinite(baselineToUsd) ? baselineToUsd : undefined);

      // normalize pairs + pairType
      const diag = j?.data?.diagnostics || {};
      const pairsIn: RoutePair[] = j?.data?.pairs || [];
      let pairs: RoutePair[] = pairsIn;

      if (pairsIn.length === 1) {
        const ptype: string | undefined =
          diag?.sell_leg?.pairType || diag?.buy_leg?.pairType;
        pairs = [{ ...pairsIn[0], pairType: ptype }];
      } else if (pairsIn.length === 2) {
        pairs = [
          { ...pairsIn[0], pairType: diag?.sell_leg?.pairType },
          { ...pairsIn[1], pairType: diag?.buy_leg?.pairType },
        ];
      }
      setRoutePairs(pairs);

      // top-level price_native (B per A on token→token routes; for ZIG routes it’s the ZIG ratio form)
      const pn = j?.data?.price_native ?? undefined;
      setPriceNative(pn);

      // cross.usd_per_from — USD per 1 unit of the **pay** token for the selected size
      let upf: number | undefined = j?.data?.cross?.usd_per_from ?? undefined;

      // ZIG fallbacks if your server returns price_usd/pn in single-hop zig routes
      const payIsZig = String(fromRef).toLowerCase() === "uzig";
      const recvIsZig = String(toRef).toLowerCase() === "uzig";
      if (upf == null && recvIsZig) {
        const pUsd = j?.data?.price_usd;
        if (Number.isFinite(pUsd)) upf = pUsd;
      }
      if (upf == null && payIsZig) {
        const pUsd = j?.data?.price_usd;
        const pNat = j?.data?.price_native;
        if (Number.isFinite(pUsd) && Number.isFinite(pNat) && pNat > 0) {
          upf = pUsd / pNat;
        }
      }
      setUsdPerFrom(upf);

      // Optional: independent prices endpoint (if available)
      // try {
      //   const denoms = [fromRef, toRef].map(encodeURIComponent).join(",");
      //   const pr = await fetch(`${apiBase}/prices?denoms=${denoms}`);
      //   const pj = await pr.json();
      //   const mp = pj?.data || pj?.prices || pj || {};
      //   const getUsd = (k: string) => {
      //     const v = mp[k] ?? mp[k?.toLowerCase?.()] ?? mp[k?.toUpperCase?.()];
      //     return Number.isFinite(Number(v)) ? Number(v) : undefined;
      //   };
      //   setUsdPerPay(getUsd(fromRef));
      //   setUsdPerRecv(getUsd(toRef));
      // } catch { /* ignore */ }

      // “footer” indicative values when cross exists
      const zpf = j?.data?.cross?.zig_per_from ?? undefined;
      if (Number.isFinite(pn) && pn! > 0 && Number.isFinite(zpf)) {
        setRecvPriceZig(zpf / pn!);
        setRecvPriceUsd(upf != null ? upf / pn! : undefined);
      } else {
        setRecvPriceZig(undefined);
        setRecvPriceUsd(undefined);
      }
    } catch (e: any) {
      setErr(e?.message || "Failed to fetch route");
    }
  }, [apiBase, fromRef, toRef, fetchApi]);

  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    void runRouteFetch();
    if (!autoRefresh) return;
    pollRef.current = setInterval(() => void runRouteFetch(), 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [runRouteFetch, autoRefresh]);

  /* =========================
   * Balances (helpers)
   * ========================= */
  const loadBalanceFor = useCallback(
    async (
      cw: any,
      addr: string,
      asset: {
        denom?: string;
        contract?: string;
        decimals: number;
        type: "native" | "cw20";
      }
    ) => {
      if (!addr) return 0;
      let value = 0;
      if (asset.type === "native") {
        try {
          const denom = cleanDenom(asset.denom!);
          const coin = await cw.getBalance(addr, denom);
          const got =
            (coin as any)?.amount ?? (coin as any)?.coin?.amount ?? "0";
          value =
            asset.decimals === 0
              ? Number(got || "0")
              : Number(got || "0") / pow10(asset.decimals);
        } catch {}
      } else {
        try {
          const q: any = await cw.queryContractSmart(asset.contract!, {
            balance: { address: addr },
          });
          const got = q?.balance ?? "0";
          value =
            asset.decimals === 0
              ? Number(got || "0")
              : Number(got || "0") / pow10(asset.decimals);
        } catch {}
      }
      return value;
    },
    []
  );

  const inFlightRef = useRef(false);
  const safeLoadPayBalance = useCallback(async () => {
    if (!client || !address) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const a = activePay;
      const v = await loadBalanceFor(client, address, {
        type: a.type,
        denom: (a as any).denom,
        contract: (a as any).contract,
        decimals: a.decimals,
      });
      setBalances((p) => ({ ...p, [keyOf(a)]: v }));
    } finally {
      inFlightRef.current = false;
    }
  }, [client, address, activePay, loadBalanceFor]);

  /* ----- connect / disconnect ----- */
  async function connect(wallet: "keplr" | "leap", silent = false) {
    setErr("");
    try {
      const ext =
        wallet === "keplr" ? (window as any).keplr : (window as any).leap;
      if (!ext) {
        if (!silent) setErr(`${wallet.toUpperCase()} extension not found`);
        return;
      }
      const suggest = ext.experimentalSuggestChain || ext.suggestChain;
      if (suggest) {
        await suggest({
          chainId,
          chainName: "ZigChain",
          rpc: rpcUrl,
          rest: rpcUrl.replace(/^ws/, "http").replace(/^wss/, "https"),
          bip44: { coinType: 118 },
          bech32Config: {
            bech32PrefixAccAddr: "zig",
            bech32PrefixAccPub: "zigpub",
            bech32PrefixValAddr: "zigvaloper",
            bech32PrefixValPub: "zigvaloperpub",
            bech32PrefixConsAddr: "zigvalcons",
            bech32PrefixConsPub: "zigvalconspub",
          },
          currencies: [
            { coinDenom: "ZIG", coinMinimalDenom: "uzig", coinDecimals: 6 },
          ],
          feeCurrencies: [
            { coinDenom: "ZIG", coinMinimalDenom: "uzig", coinDecimals: 6 },
          ],
          stakeCurrency: {
            coinDenom: "ZIG",
            coinMinimalDenom: "uzig",
            coinDecimals: 6,
          },
          features: ["cosmwasm"],
        });
      }
      await ext.enable(chainId);
      const signer = await ext.getOfflineSignerAuto(chainId);
      const [{ address }] = await signer.getAccounts();
      const { GasPrice } = await import("@cosmjs/stargate");
      const { SigningCosmWasmClient } = await import(
        "@cosmjs/cosmwasm-stargate"
      );
      const gasPrice = GasPrice.fromString(`0.025uzig`);
      const cw = await SigningCosmWasmClient.connectWithSigner(rpcUrl, signer, {
        gasPrice: gasPrice as any,
      });
      setClient(cw);
      setAddress(address);
      void safeLoadPayBalance();
    } catch (e: any) {
      setErr("No accounts found in local storage. Please create an account in your wallet.");
    }
  }

  function disconnect() {
    setAddress("");
    setClient(null);
    setBalances({});
    setAmountIn("");
  }

  async function ensureConnectedForAction(): Promise<boolean> {
    if (client && address) return true;
    const currentWallet =
      localStorage.getItem("cosmos-kit@2:core//current-wallet") || "";
    const kind = currentWallet.includes("keplr")
      ? "keplr"
      : currentWallet.includes("leap")
      ? "leap"
      : null;
    if (!kind) {
      setErr("Connect wallet first");
      return false;
    }
    await connect(kind as any);
    return !!(client && address);
  }

  useEffect(() => {
    function readCosmosKitAddress() {
      try {
        const raw = localStorage.getItem("cosmos-kit@2:core//accounts") || "[]";
        const parsed = JSON.parse(raw) as Array<{
          chainId?: string;
          chainid?: string;
          address?: string;
        }>;
        const match = parsed.find(
          (a) =>
            (a as any).chainId === chainId || (a as any).chainid === chainId
        );
        if (match?.address) setAddress(match.address);
      } catch {}
    }
    readCosmosKitAddress();
    const connected = localStorage.getItem("connectedWallet");
    const currentWallet =
      localStorage.getItem("cosmos-kit@2:core//current-wallet") || "";
    const kind = currentWallet.includes("keplr")
      ? "keplr"
      : currentWallet.includes("leap")
      ? "leap"
      : null;
    if (connected === "true" && kind)
      connect(kind as "keplr" | "leap", true).catch(() => void 0);
    const onKeystoreChange = () => {
      readCosmosKitAddress();
      if (kind) connect(kind as "keplr" | "leap", true).catch(() => void 0);
    };
    window.addEventListener("keplr_keystorechange", onKeystoreChange);
    window.addEventListener("leap_keystorechange", onKeystoreChange);
    const poll = setInterval(readCosmosKitAddress, 2000);
    return () => {
      window.removeEventListener("keplr_keystorechange", onKeystoreChange);
      window.removeEventListener("leap_keystorechange", onKeystoreChange);
      clearInterval(poll);
    };
  }, [chainId]);

  useEffect(() => {
    void safeLoadPayBalance();
  }, [address, client]);

  useEffect(() => {
    if (!address || !client) return;
    void safeLoadPayBalance();
  }, [direction, other]);

  /* =========================
   * Quote simulator (pair or router hops)
   * ========================= */
  const qClientRef = useRef<any>(null);
  useEffect(() => {
    (async () => {
      if (!qClientRef.current) {
        const { CosmWasmClient } = await import("@cosmjs/cosmwasm-stargate");
        qClientRef.current = await CosmWasmClient.connect(rpcUrl);
      }
    })().catch(() => void 0);
  }, [rpcUrl]);

  const [simQuoteOut, setSimQuoteOut] = useState<number>(0);
  useEffect(() => {
    let cancelled = false;
    const doSim = async () => {
      const a = Number.parseFloat(amountIn || "0");
      if (!Number.isFinite(a) || a <= 0) {
        setSimQuoteOut(0);
        return;
      }
      if (!qClientRef.current || routePairs.length === 0) return;
      try {
        const amountInMicro =
          activePay.decimals === 0
            ? Math.round(a).toString()
            : Math.round(a * pow10(activePay.decimals)).toString();

        if (routePairs.length === 1) {
          const pair = routePairs[0];
          const offer_asset =
            activePay.type === "native"
              ? {
                  amount: amountInMicro,
                  info: { native_token: { denom: (activePay as any).denom } },
                }
              : {
                  amount: amountInMicro,
                  info: {
                    token: { contract_addr: (activePay as any).contract },
                  },
                };
          const sim: any = await qClientRef.current.queryContractSmart(
            pair.pairContract,
            { simulation: { offer_asset } }
          );
          const returnMicro = Number(sim?.return_amount || "0");
          const out =
            activeReceive.decimals === 0
              ? returnMicro
              : returnMicro / pow10(activeReceive.decimals);
          if (!cancelled) setSimQuoteOut(out);
          return;
        }

        // 2 hops via uzig
        const pair1 = routePairs[0];
        const offer1 =
          activePay.type === "native"
            ? {
                amount: amountInMicro,
                info: { native_token: { denom: (activePay as any).denom } },
              }
            : {
                amount: amountInMicro,
                info: { token: { contract_addr: (activePay as any).contract } },
              };
        const sim1: any = await qClientRef.current.queryContractSmart(
          pair1.pairContract,
          { simulation: { offer_asset: offer1 } }
        );
        const hop1ReturnMicro = String(sim1?.return_amount || "0");
        const pair2 = routePairs[1];
        const sim2: any = await qClientRef.current.queryContractSmart(
          pair2.pairContract,
          {
            simulation: {
              offer_asset: {
                amount: hop1ReturnMicro,
                info: { native_token: { denom: "uzig" } },
              },
            },
          }
        );
        const return2Micro = Number(sim2?.return_amount || "0");
        const out =
          activeReceive.decimals === 0
            ? return2Micro
            : return2Micro / pow10(activeReceive.decimals);
        if (!cancelled) setSimQuoteOut(out);
      } catch {
        if (!cancelled) setSimQuoteOut(0);
      }
    };
    const t = setTimeout(doSim, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [amountIn, routePairs, activePay, activeReceive]);

  /* =========================
   * USD calculations (Pay / Receive)
   * ========================= */
  const amountInNum = useMemo(
    () => Number.parseFloat(amountIn || "0"),
    [amountIn]
  );

  // Pay $ = amount * baseline $/PAY
  const payUsd = useMemo(() => {
    if (!(amountInNum > 0) || !Number.isFinite(usdPerPay as number))
      return undefined;
    return amountInNum * (usdPerPay as number);
  }, [amountInNum, usdPerPay]);

  // Receive $ = simQuoteOut * baseline $/RECEIVE
  const receiveUsd = useMemo(() => {
    if (!(simQuoteOut > 0) || !Number.isFinite(usdPerRecv as number))
      return undefined;
    return simQuoteOut * (usdPerRecv as number);
  }, [simQuoteOut, usdPerRecv]);

  /* =========================
   * SWAP (single hop direct pair OR router via operations)
   * ========================= */
  async function onSwap() {
    try {
      setErr("");
      if (routePairs.length === 0) throw new Error("Route not ready");
      const ok = await ensureConnectedForAction();
      if (!ok) return;

      const amt = Number.parseFloat(amountIn || "0");
      if (!Number.isFinite(amt) || amt <= 0)
        throw new Error("Enter a valid amount");

      setBusy(true);

      const amountInMicro =
        activePay.decimals === 0
          ? Math.round(amt).toString()
          : Math.round(amt * pow10(activePay.decimals)).toString();

      const chosenSlippage = slippageBps / 10_000;
      const max_spread_str = Math.max(
        0.005,
        Math.min(0.5, chosenSlippage)
      ).toFixed(3);

      // simulate again to compute min receive
      let expectedOutMicro = "0";
      if (routePairs.length === 1) {
        const pair = routePairs[0];
        const offer_asset =
          activePay.type === "native"
            ? {
                amount: amountInMicro,
                info: { native_token: { denom: (activePay as any).denom } },
              }
            : {
                amount: amountInMicro,
                info: { token: { contract_addr: (activePay as any).contract } },
              };
        const sim: any = await qClientRef.current.queryContractSmart(
          pair.pairContract,
          { simulation: { offer_asset } }
        );
        expectedOutMicro = String(sim?.return_amount || "0");
      } else if (routePairs.length === 2) {
        const pair1 = routePairs[0];
        const pair2 = routePairs[1];
        const offer1 =
          activePay.type === "native"
            ? {
                amount: amountInMicro,
                info: { native_token: { denom: (activePay as any).denom } },
              }
            : {
                amount: amountInMicro,
                info: { token: { contract_addr: (activePay as any).contract } },
              };
        const sim1: any = await qClientRef.current.queryContractSmart(
          pair1.pairContract,
          { simulation: { offer_asset: offer1 } }
        );
        const hop1ReturnMicro = String(sim1?.return_amount || "0");
        const sim2: any = await qClientRef.current.queryContractSmart(
          pair2.pairContract,
          {
            simulation: {
              offer_asset: {
                amount: hop1ReturnMicro,
                info: { native_token: { denom: "uzig" } },
              },
            },
          }
        );
        expectedOutMicro = String(sim2?.return_amount || "0");
      } else {
        throw new Error("Unsupported route length");
      }

      const minReceiveMicroNum = Math.floor(
        Number(expectedOutMicro) * (1 - Math.max(0.005, chosenSlippage))
      );
      const minimum_receive = String(Math.max(0, minReceiveMicroNum));

      if (routePairs.length === 1) {
        const pair = routePairs[0];
        if (activePay.type === "native") {
          const { coins } = await import("@cosmjs/stargate");
          const msg = {
            swap: {
              max_spread: max_spread_str,
              offer_asset: {
                amount: amountInMicro,
                info: { native_token: { denom: (activePay as any).denom } },
              },
              to: address,
            },
          };
          // Calculate fee amount and remaining amount for swap
          const totalAmount = BigInt(amountInMicro);
          // Ensure minimum fee of 1 unit to avoid "0coin" error
          let feeAmount =
            (totalAmount * BigInt(Math.floor(FEE_PERCENTAGE * 1000000))) /
            BigInt(1000000);
          // Ensure at least 1 unit fee and at least 1 unit left for swap
          if (feeAmount < BigInt(1)) feeAmount = BigInt(1);
          if (totalAmount - feeAmount < BigInt(1))
            feeAmount = totalAmount - BigInt(1);
          const swapAmount = totalAmount - feeAmount;

          // Create funds for the swap (using remaining amount after fee)
          const funds = coins(swapAmount.toString(), (activePay as any).denom);

          // Update the swap message with the adjusted amount
          msg.swap.offer_asset.amount = swapAmount.toString();

          // Create fee message (only if fee is greater than 0)
          const feeMsg = {
            typeUrl: "/cosmos.bank.v1beta1.MsgSend",
            value: {
              fromAddress: address,
              toAddress: FEE_RECEIVER_ADDRESS,
              amount: [
                {
                  denom: (activePay as any).denom,
                  amount: feeAmount.toString(), // Ensure this is a valid string representation of an integer
                },
              ],
            },
          };

          // Create swap message with updated amount
          const swapMsg = {
            typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
            value: {
              sender: address,
              contract: pair.pairContract,
              msg: Buffer.from(JSON.stringify(msg)),
              funds: funds,
            },
          };

          // Execute both messages in a single transaction
          const res = await client.signAndBroadcast(
            address,
            [feeMsg, swapMsg],
            "auto",
            `Traded from degenter.io`
          );

          setTxHash(res.transactionHash);
          setShowTxAlert(true);
          setAmountIn(""); // Clear the input field after successful swap
        } else {
          const ask_asset_info =
            activeReceive.type === "native"
              ? { native_token: { denom: (activeReceive as any).denom } }
              : { token: { contract_addr: (activeReceive as any).contract } };
          const inner = {
            swap: {
              belief_price: undefined,
              max_spread: max_spread_str,
              ask_asset_info,
              to: address,
            },
          };
          // Calculate 0.01% fee for CW20 tokens
          const feeAmount = Math.floor(Number(amountInMicro) * FEE_PERCENTAGE);

          // Create fee message for CW20
          const feeMsg = {
            typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
            value: {
              sender: address,
              contract: (activePay as any).contract,
              msg: Buffer.from(
                JSON.stringify({
                  send: {
                    contract: FEE_RECEIVER_ADDRESS,
                    amount: feeAmount.toString(), // Ensure this is a valid string representation of an integer
                    msg: b64({}),
                  },
                })
              ),
              funds: [],
            },
          };

          // Create swap message for CW20
          const swapMsg = {
            typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
            value: {
              sender: address,
              contract: (activePay as any).contract,
              msg: Buffer.from(
                JSON.stringify({
                  send: {
                    contract: pair.pairContract,
                    amount: amountInMicro,
                    msg: b64(inner),
                  },
                })
              ),
              funds: [],
            },
          };

          // Execute both messages in a single transaction
          const res = await client.signAndBroadcast(
            address,
            [feeMsg, swapMsg],
            "auto",
            `Traded from degenter.io`
          );
          setTxHash(res.transactionHash);
          setShowTxAlert(true);
          setAmountIn(""); // Clear the input field after successful swap
        }
      } else {
        // router path
        const operations = routePairs.map((p, idx) => {
          const isFirst = idx === 0;
          const isLast = idx === routePairs.length - 1;

          const offer_asset_info = isFirst
            ? activePay.type === "native"
              ? { native_token: { denom: (activePay as any).denom } }
              : { token: { contract_addr: (activePay as any).contract } }
            : { native_token: { denom: "uzig" } };

          const ask_asset_info = isLast
            ? activeReceive.type === "native"
              ? { native_token: { denom: (activeReceive as any).denom } }
              : { token: { contract_addr: (activeReceive as any).contract } }
            : { native_token: { denom: "uzig" } };

          const normalizedType = toRouterPairType(p.pairType);
          return {
            oro_swap: {
              offer_asset_info,
              ask_asset_info,
              pair_type: normalizedType,
            },
          };
        });

        const msgNative = {
          execute_swap_operations: {
            operations,
            minimum_receive,
            max_spread: max_spread_str,
            to: address,
          },
        };

        if (activePay.type === "native") {
          const { coins } = await import("@cosmjs/stargate");
          const funds = coins(amountInMicro, (activePay as any).denom);
          const res = await client.execute(
            address,
            ROUTER_CONTRACT,
            msgNative as any,
            "auto",
            MEMO,
            funds
          );
          setTxHash(res.transactionHash);
          setShowTxAlert(true);
          setAmountIn(""); // Clear the input field after successful swap
        } else {
          const msg64 = b64(msgNative);
          const sendMsg = {
            send: {
              contract: ROUTER_CONTRACT,
              amount: amountInMicro,
              msg: msg64,
            },
          };
          const res = await client.execute(
            address,
            (activePay as any).contract,
            sendMsg as any,
            "auto",
            MEMO
          );
          setTxHash(res.transactionHash);
          setShowTxAlert(true);
          setAmountIn(""); // Clear the input field after successful swap
        }
      }

      // refresh pay balance
      const v = await loadBalanceFor(client, address, {
        type: activePay.type,
        denom: (activePay as any).denom,
        contract: (activePay as any).contract,
        decimals: activePay.decimals,
      });
      setBalances((p) => ({ ...p, [keyOf(activePay)]: v }));
    } catch (e: any) {
      const m = String(e?.message || e);
      const parsedKey = parseRouterKeyFromError(m);
      if (/max spread/i.test(m))
        setErr(
          "Price moved more than your slippage. Increase slippage and try again."
        );
      else if (/pair|pair_info|not found/i.test(m))
        setErr(
          "Router could not resolve this pool in its registry (pair_info not found)."
        );
      else setErr(parsedKey ? `${m}\n(${parsedKey})` : m);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!address || !client) return;
    void safeLoadPayBalance();
  }, [address, client]);

  useEffect(() => {
    if (showTxAlert) {
      const t = setTimeout(() => setShowTxAlert(false), 8000);
      return () => clearTimeout(t);
    }
  }, [showTxAlert]);

  /* =========================
   * UI helpers
   * ========================= */
  function flip() {
    setPayDDOpen(false);
    setRecvDDOpen(false);
    setDirection((d) =>
      d === "payToReceive" ? "receiveToPay" : "payToReceive"
    );
    setAmountIn("");
    setErr("");
  }

  function fillMax() {
    const k = keyOf(activePay);
    let bal = balances[k] || 0;
    if (activePay.type === "native" && (activePay as any).denom === "uzig")
      bal = Math.max(0, bal - 0.2);
    setAmountIn(bal.toFixed(Math.min(6, activePay.decimals)));
  }

  const payBalance = balances[keyOf(activePay)] ?? 0;

  /* =========================
   * Token selector (with lazy balances)
   * ========================= */
  type SelectorProps = {
    id: "pay" | "recv";
    open: boolean;
    setOpen: (b: boolean) => void;
    disabled?: boolean;
    valueDenom: string;
    valueLabel: string;
    onChange: (t: TokenListItem) => void;
    disabledDenoms?: string[];
    quickSymbols?: string[]; // ["ZIG","USDC","USDT"]
  };

  const ddItems = useMemo(
    () => tokenList.slice().sort((a, b) => a.symbol.localeCompare(b.symbol)),
    [tokenList]
  );

  const Selector = memo(function Selector({
    id,
    open,
    setOpen,
    disabled,
    valueDenom,
    valueLabel,
    onChange,
    disabledDenoms = [],
    quickSymbols = ["ZIG", "USDC", "USDT"],
  }: SelectorProps) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const listRef = useRef<HTMLDivElement | null>(null);
    const [q, setQ] = useState("");
    const [cursor, setCursor] = useState(0);
    const [page, setPage] = useState(1); // 40 per page

    const normalized = useMemo(() => {
      const lower = q.trim().toLowerCase();
      const base = ddItems.filter((t) => !disabledDenoms.includes(t.denom));
      const filtered = !lower
        ? base
        : base.filter(
            (t) =>
              t.symbol.toLowerCase().includes(lower) ||
              t.denom.toLowerCase().includes(lower) ||
              (t.name || "").toLowerCase().includes(lower)
          );
      return filtered.slice(0, page * 40);
    }, [q, page, ddItems, disabledDenoms]);

    const [rowBalances, setRowBalances] = useState<Record<string, number>>({});
    const busySet = useRef<Set<string>>(new Set());

    const requestBalance = useCallback(
      async (denom: string, decimals: number, isCw20: boolean = false) => {
        if (!client || !address) return;
        if (busySet.current.has(denom)) return;
        busySet.current.add(denom);
        try {
          let val = 0;
          if (isCw20) {
            // Handle CW20 token balance
            const cw20Balance = await client.queryContractSmart(denom, {
              balance: { address },
            });
            val = Number(cw20Balance.balance) / Math.pow(10, decimals);
          } else {
            // Handle native token balance
            const nativeBalance = await loadBalanceFor(client, address, {
              type: "native",
              denom,
              decimals,
            } as any);
            val = nativeBalance;
          }
          setRowBalances((prev) => ({ ...prev, [denom]: val }));
        } catch (error) {
          console.error(`Error fetching balance for ${denom}:`, error);
          setRowBalances((prev) => ({ ...prev, [denom]: 0 }));
        } finally {
          busySet.current.delete(denom);
        }
      },
      [client, address, loadBalanceFor]
    );

    useEffect(() => {
      if (!open) return;
      const onDown = (e: MouseEvent) => {
        if (
          dropdownRef.current &&
          !dropdownRef.current.contains(e.target as Node)
        ) {
          setOpen(false);
        }
      };
      window.addEventListener("mousedown", onDown);
      return () => window.removeEventListener("mousedown", onDown);
    }, [open]);

    useEffect(() => {
      if (!open) return;
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          setOpen(false);
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setCursor((c) => Math.min(c + 1, normalized.length - 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setCursor((c) => Math.max(c - 1, 0));
        } else if (e.key === "Enter") {
          e.preventDefault();
          const t = normalized[cursor];
          if (t) {
            onChange(t);
            setOpen(false);
          }
        }
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [open, normalized, cursor, onChange, setOpen]);

    useEffect(() => {
      if (!open || !listRef.current) return;
      const el = listRef.current;
      const onScroll = () => {
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24)
          setPage((p) => p + 1);
      };
      el.addEventListener("scroll", onScroll);
      return () => el.removeEventListener("scroll", onScroll);
    }, [open]);

    useEffect(() => {
      if (!open || !client || !address) return;

      // Load balances for all visible tokens
      normalized.forEach((t) => {
        const isCw20 = t.denom.startsWith("zig1");
        if (!busySet.current.has(t.denom)) {
          requestBalance(t.denom, t.exponent, isCw20);
        }
      });

      // Cleanup function to cancel any pending requests when modal closes
      return () => {
        // Optionally clear the busy set when modal closes
        // busySet.current.clear();
      };
    }, [open, normalized, client, address, requestBalance]);

    const renderTokenItems = useMemo(() => {
      return normalized.map((t, i) => (
        <RowItem
          key={`${t.tokenId}-${t.denom}`}
          t={t}
          i={i}
          cursor={cursor}
          setCursor={setCursor}
          onChange={onChange}
          balance={rowBalances[t.denom]}
          tokenIcon={tokenIcon}
          isActive={i === cursor}
        />
      ));
    }, [normalized, cursor, onChange, rowBalances, tokenIcon]);

    return (
      <div className="">
        <button
          type="button"
          onClick={() => !disabled && setOpen(!open)}
          className={`flex items-center overflow-hidden gap-2 ${
            disabled ? "bg-black/40" : "bg-black/50 hover:bg-black/60"
          } border border-neutral-700 rounded-lg px-2 py-1.5 text-white`}
          aria-expanded={open}
          aria-controls={`${id}-menu`}
        >
          <img
            src={iconForDenom(valueDenom, valueLabel)}
            className="w-5 h-5 rounded-full object-cover"
            alt={valueLabel}
          />
          <span className="text-sm">{valueLabel}</span>
        </button>

        {open && !disabled && (
          <div className="absolute z-[100000] w-full h-full top-[320px] left-0">
            <div
              id={`${id}-menu`}
              className=" mt-2 w-[320px] rounded-xl border border-neutral-800 bg-[#0b0b0b]/95 shadow-xl z-50"
            >
              <div className="flex items-center justify-between px-3 pt-3 pb-2">
                <div className="flex items-center gap-2 flex-1 bg-black/40 border border-neutral-800 rounded-lg px-2 py-1.5">
                  <Search size={16} className="text-neutral-400" />
                  <input
                    ref={inputRef}
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setCursor(0);
                      setPage(1);
                    }}
                    placeholder="Search name or denom"
                    className="bg-transparent outline-none text-[0.95rem] text-white flex-1"
                  />
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="ml-2 p-1 rounded hover:bg-white/5"
                >
                  <X size={16} className="text-neutral-300" />
                </button>
              </div>

              <div className="px-3 pb-2 flex items-center gap-2 flex-wrap">
                {["ZIG", "USDC", "USDT"].map((sym) => {
                  const t = ddItems.find(
                    (x) => x.symbol.toUpperCase() === sym.toUpperCase()
                  );
                  if (!t) return null;
                  return (
                    <button
                      key={sym}
                      onClick={() => {
                        onChange(t);
                        setOpen(false);
                      }}
                      className="flex items-center gap-1 bg-black/40 hover:bg-black/60 text-white text-xs border border-neutral-800 rounded-lg px-2 py-1"
                      title={t.name || t.symbol}
                    >
                      <img
                        src={
                          t.imageUri ||
                          (t.symbol === "ZIG" ? ZIG_ICON : tokenIcon)
                        }
                        className="w-4 h-4 rounded-full"
                      />
                      {sym}
                      {t.verified && (
                        <ShieldCheck size={12} className="text-emerald-400" />
                      )}
                    </button>
                  );
                })}
              </div>

              <div ref={listRef} className="max-h-80 overflow-auto">
                {renderTokenItems}
                {normalized.length === 0 && (
                  <div className="px-3 py-8 text-center text-neutral-400 text-sm">
                    No tokens match your search
                  </div>
                )}
              </div>

              <div className="px-3 py-2 border-t border-neutral-800 text-[11px] text-neutral-400 flex items-center justify-between">
                <span>↑/↓ to navigate • Enter to select</span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-[1px] bg-black/60 rounded border border-neutral-800">
                    Esc
                  </kbd>{" "}
                  close
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  });

  const RowItem = memo(
    ({
      t,
      i,
      cursor,
      setCursor,
      onChange,
      balance,
      tokenIcon,
      isActive,
    }: {
      t: TokenListItem;
      i: number;
      cursor: number;
      setCursor: (i: number) => void;
      onChange: (t: TokenListItem) => void;
      balance?: number;
      tokenIcon?: string;
      isActive: boolean;
    }) => {
      const bal = balance !== undefined ? balance : 0;
      const displayBalance = Number.isFinite(bal) ? bal : 0;

      return (
        <button
          type="button"
          onMouseEnter={() => setCursor(i)}
          onClick={() => {
            onChange(t);
          }}
          className={`w-full px-3 py-2.5 text-left flex items-center justify-between hover:bg-white/5 transition-colors ${
            isActive ? "bg-white/10" : ""
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={t.imageUri || (t.symbol === "ZIG" ? ZIG_ICON : tokenIcon)}
              className="w-6 h-6 rounded-full"
              alt={t.symbol}
            />
            <div className="min-w-0">
              <div className="text-sm font-medium text-white truncate flex items-center gap-1">
                {t.symbol}
                {t.verified && (
                  <ShieldCheck size={14} className="text-emerald-400" />
                )}
              </div>
              <div className="text-xs text-neutral-400 truncate">
                {t.name || truncMid(t.denom, 6, 4)}
              </div>
            </div>
          </div>
          <div className="ml-2 text-right min-w-[92px]">
            <div className="text-sm text-white tabular-nums">
              {fmt(displayBalance, Math.min(6, t.exponent ?? 6))}
            </div>
          </div>
        </button>
      );
    }
  );
  RowItem.displayName = "RowItem";

  const payIsSelectable = direction === "payToReceive";
  const receiveIsSelectable = direction === "receiveToPay";

  const [isSingleHop, setIsSingleHop] = useState(false);

  // Add this effect to update isSingleHop when routePairs changes
  useEffect(() => {
    setIsSingleHop(routePairs.length === 1);
  }, [routePairs]);

  /* =========================
   * RENDER
   * ========================= */
  return (
    <div className="my-3 bg-black/30 rounded-xl p-4 duration-200 border border-[#808080]/40">
      {/* header */}
      <div className="flex items-center justify-between my-3">
        <div className="text-xl items-center justify-center font-medium text-white/70">
          <p>Swap</p>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowSlippageModal((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-black/50 px-3 py-1.5 text-sm text-white hover:bg-black/70"
            title="Slippage tolerance"
          >
            <span className="opacity-80">Slippage</span>
            <span className="rounded-lg bg-emerald-500/15 px-2 py-0.5 text-emerald-300 tabular-nums">
              {slippagePct}%
            </span>
            <svg
              viewBox="0 0 20 20"
              className="h-4 w-4 opacity-70"
              fill="currentColor"
            >
              <path d="M6 8l4 4 4-4H6z" />
            </svg>
          </button>

          {showSlippageModal && (
            <div
              ref={dropdownRef}
              className="absolute right-0 z-[1000] mt-2 w-72 rounded-xl border border-white/10 bg-[#0b0b0b]/95 p-4 shadow-2xl backdrop-blur"
            >
              <div className="mb-3 text-center text-sm font-medium text-white">
                Slippage tolerance
              </div>

              <div className="mb-3 grid grid-cols-4 gap-2">
                {preset.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPct(p)}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      Number(slippagePct) === p
                        ? "border-emerald-400 bg-emerald-400/15 text-emerald-300"
                        : "border-white/10 bg-white/5 text-white hover:border-white/20"
                    }`}
                  >
                    {p}%
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <input
                  inputMode="decimal"
                  placeholder="Custom (0–50)"
                  className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder-white/40 outline-none focus:border-white/25"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const v = Number((e.target as HTMLInputElement).value);
                      if (Number.isFinite(v) && v >= 0 && v <= 50) setPct(v);
                    }
                  }}
                />
                <button
                  onClick={() => setShowSlippageModal(false)}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white hover:border-white/20"
                >
                  Close
                </button>
              </div>

              <div className="mt-3 text-xs text-white/60">
                Higher slippage increases chance of success but may result in
                worse price.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pay */}
      <div>
        <div className="flex items-center justify-between text-sm my-3">
          <span className="text-neutral-300">Pay:</span>
          <span className="text-neutral-400">
            Balance: {fmt(payBalance ?? 0, Math.min(6, activePay.decimals))}{" "}
            {activePay.symbol}
          </span>
        </div>
        <div className="bg-black/30 border border-neutral-800 rounded-xl p-3 flex flex-col-reverse self-end">
          {/* <div className="bg-black/30 border border-neutral-800 rounded-xl p-3 grid grid-cols-2 items-center justify-between"> */}

          <div className="my-2 ">
            <input
              value={amountIn}
              onChange={(e) => setAmountIn(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="bg-transparent text-lg focus:outline-none w-full text-white"
            />
            <div className="text-[16px] text-neutral-400 mt-1 w-[50px]">
              {fmtUSD(payUsd)}
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={fillMax}
              disabled={!address}
              className="text-xs bg-black/50 hover:bg-black/50 text-white px-2 py-1 rounded-lg"
            >
              Max
            </button>

            <Selector
              id="pay"
              open={payDDOpen}
              setOpen={(b) => {
                if (!payIsSelectable) return;
                setRecvDDOpen(false);
                setPayDDOpen(b);
              }}
              disabled={!payIsSelectable}
              valueDenom={
                activePay.type === "native"
                  ? (activePay as any).denom
                  : (activePay as any).contract
              }
              valueLabel={activePay.symbol}
              onChange={(t) => {
                const next: SwapAsset = {
                  type: "native",
                  denom: t.denom,
                  symbol: t.symbol,
                  icon:
                    t.imageUri ||
                    (t.symbol.toUpperCase() === "ZIG" ? ZIG_ICON : tokenIcon),
                  decimals: t.exponent ?? 6,
                };
                if (
                  PAGE_TOKEN.type === "native" &&
                  t.denom === (PAGE_TOKEN as any).denom
                )
                  return;
                setOther(next);
                setAmountIn("");
                setErr("");
              }}
              disabledDenoms={[
                PAGE_TOKEN.type === "native"
                  ? (PAGE_TOKEN as any).denom
                  : "___never___",
              ]}
              quickSymbols={["ZIG", "USDC", "USDT"]}
            />
          </div>
        </div>
      </div>

      {/* Flip */}
      <div className="flex justify-center mt-[12px]">
        <button
          onClick={flip}
          className="bg-black/50 p-2 rounded-full border-2 border-white hover:bg-black/70 transition-colors"
          title="Flip swap direction"
        >
          <ArrowUpDown size={16} className="text-white" />
        </button>
      </div>

      {/* Receive: meri marzi */}
      <div>
        <div className="flex items-center justify-between text-sm my-3">
          <span className="text-neutral-300">Receive:</span>
          <span className="text-neutral-400"></span>
        </div>
        <div className="bg-black/30 border border-neutral-800 rounded-xl p-3 grid grid-cols-2 items-center justify-between">
          {/* <div className="bg-black/30 border border-neutral-800 rounded-xl p-3 flex flex-col-reverse self-end"> */}
          <div>
            <input
              value={
                simQuoteOut
                  ? fmt(simQuoteOut, Math.min(6, activeReceive.decimals))
                  : ""
              }
              readOnly
              placeholder="0.00"
              className="bg-transparent text-lg focus:outline-none w-3/4 text-white"
            />
            <div className="text-[16px] text-neutral-400 mt-1 w-[50px]">
              {fmtUSD(receiveUsd)}
            </div>
          </div>
          <div className="flex items-center justify-end">
            <Selector
              id="recv"
              open={recvDDOpen}
              setOpen={(b) => {
                if (!receiveIsSelectable) return;
                setPayDDOpen(false);
                setRecvDDOpen(b);
              }}
              disabled={!receiveIsSelectable}
              valueDenom={
                activeReceive.type === "native"
                  ? (activeReceive as any).denom
                  : (activeReceive as any).contract
              }
              valueLabel={activeReceive.symbol}
              onChange={(t) => {
                if (
                  PAGE_TOKEN.type === "native" &&
                  t.denom === (PAGE_TOKEN as any).denom
                )
                  return;
                const next: SwapAsset = {
                  type: "native",
                  denom: t.denom,
                  symbol: t.symbol,
                  icon:
                    t.imageUri ||
                    (t.symbol.toUpperCase() === "ZIG" ? ZIG_ICON : tokenIcon),
                  decimals: t.exponent ?? 6,
                };
                setOther(next);
                setAmountIn("");
                setErr("");
              }}
              disabledDenoms={[
                PAGE_TOKEN.type === "native"
                  ? (PAGE_TOKEN as any).denom
                  : "___never___",
              ]}
              quickSymbols={["ZIG", "USDC", "USDT"]}
            />
          </div>
        </div>

        {/* ---- Price footer (single vs multi-hop) ---- */}

        <PriceDisplay
          isSingleHop={routePairs.length === 1}
          activePay={activePay}
          activeReceive={activeReceive}
          routePairs={routePairs}
          qClientRef={qClientRef}
          recvPriceUsd={receiveUsd}
        />
      </div>

      {err && (
        <div className="mt-2 text-xs text-red-400 break-all mb-2">{err}</div>
      )}

      {!address ? (
        <div className="flex gap-3 mt-3">
          <button
            onClick={() => connect("keplr")}
            className="flex-1 bg-[#39C8A6] text-black font-medium text-[1rem] py-3 rounded-lg hover:bg-[#2fb896] transition-colors"
          >
            Connect Keplr
          </button>
          <button
            onClick={() => connect("leap")}
            className="flex-1 bg-[#39C8A6] text-black font-medium text-[1rem] py-3 rounded-lg hover:bg-[#2fb896] transition-colors"
          >
            Connect Leap
          </button>
        </div>
      ) : (
        <div className="space-y-2 mt-3">
          <button
            onClick={onSwap}
            disabled={busy || routePairs.length === 0}
            className="w-full bg-[#39C8A6] text-black font-medium text-[1rem] py-3 rounded-lg hover:bg-[#2fb896] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy ? "Swapping…" : "Swap"}
          </button>
        </div>
      )}

      {showTxAlert && txHash && (
        <div className="bottom-0 right-4 text-white p-4 rounded-xl bg-black/80 backdrop-blur-md shadow-lg max-w-md z-50 border border-[#39C8A6]/30">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <h3 className="font-semibold mb-1 text-[#39C8A6]">
                ✅ Swap Successful!
              </h3>
              <p className="text-sm text-gray-300 break-all">{txHash}</p>
            </div>
            <div className="flex space-x-2 ml-4">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(txHash);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="text-xs bg-[#39C8A6] hover:bg-[#2fb896] text-black px-3 py-1 rounded"
              >
                {copied ? "✓" : "Copy"}
              </button>
              <button
                onClick={() => setShowTxAlert(false)}
                className="text-xs bg-black/50 hover:bg-black/70 px-2 py-1 rounded"
              >
                ×
              </button>
            </div>
          </div>
          <div className="mt-2 text-xs">
            <a
              href={`https://zigscan.org/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#39C8A6] hover:underline"
            >
              View on Explorer →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
