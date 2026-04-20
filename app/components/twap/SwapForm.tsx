"use client";


import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Coin } from "@cosmjs/amino";
import type { DeliverTxResponse, StdFee } from "@cosmjs/stargate";
import { toUtf8 } from "@cosmjs/encoding";
import { WalletStatus } from "@cosmos-kit/core";
import { ArrowUpDown } from "lucide-react";
import { useWallet } from "@/lib/twap/useWallet";
import { useTwapClients } from "@/lib/twap/useTwapClients";
import {
  DEFAULT_BALANCE_DENOM,
  TWAP_CONTRACT_ADDRESS,
} from "@/lib/twap/constants";
import { dispatchTwapChunkEvent } from "@/lib/twap/events";
import type {
  AssetInfo,
  OroSwapOperation,
  PairType,
} from "@/schemas/TwapContract.types";
import { getTokenDecimals, toRawAmount, isValidDisplayAmount } from "@/lib/twap/tokenAmount";
import { API_BASE_URL, API_HEADERS } from "@/lib/api";


const EXPLORER_BASE_URL = "https://zigscan.org/tx/";
const GAS_PRICE_STR = "0.025uzig";
const CREATE_GAS_FALLBACK = 520000;
const MULTI_CREATE_GAS_FALLBACK = 650000;
const CANCEL_GAS_FALLBACK = 320000;
const CREATE_BUFFER = 1.18;
const MULTI_BUFFER = 1.24;
const CANCEL_BUFFER = 1.15;
const API_BASE = API_BASE_URL;
const RPC_URL =
  process.env.RPC_URL_DEGENTER ||
  "https://zigchain-rpc.degenter.io";


function buildStdFee(gasLimit: number): StdFee {
  return {
    gas: gasLimit.toString(),
    amount: [
      {
        denom: DEFAULT_BALANCE_DENOM,
        amount: Math.ceil(gasLimit * 0.025).toString(),
      },
    ],
  };
}


async function buildSimulatedFee(
  walletAddress: string | undefined,
  signingClient: any,
  msg: any,
  funds: readonly Coin[] = [],
  fallbackGas: number,
  buffer: number
): Promise<StdFee> {
  try {
    if (!walletAddress || !signingClient) throw new Error("missing signer");
    const { GasPrice, calculateFee } = await import("@cosmjs/stargate");
    const execMsg = {
      typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
      value: {
        sender: walletAddress,
        contract: TWAP_CONTRACT_ADDRESS,
        msg: toUtf8(JSON.stringify(msg)),
        funds,
      },
    };
    const simGas = await signingClient.simulate(walletAddress, [execMsg], "");
    const gasLimit = Math.max(fallbackGas, Math.ceil(simGas * buffer + 5_000));
    return calculateFee(gasLimit, GasPrice.fromString(GAS_PRICE_STR));
  } catch {
    return buildStdFee(fallbackGas);
  }
}


type SwapMode = "single" | "multi";


type SubmitState = {
  status: "idle" | "pending" | "success" | "error";
  message: string | null;
  txHash?: string | null;
};


type SingleFormCache = {
  offerDenom: string;
  askDenom: string;
  pairAddress: string;
  totalAmount: string;
  chunkCount: string;
  totalMinutes: string;
};


type MultiFormCache = {
  offerDenom: string;
  askDenom: string;
  totalAmount: string;
  chunkCount: string;
  totalMinutes: string;
  minReceive: string;
};


type SwapFormCache = {
  mode: SwapMode;
  singleForm: SingleFormCache;
  multiForm: MultiFormCache;
};

type RoutePairInfo = {
  pairContract: string;
  pairType?: string;
};

type DiagnosticsInfo = {
  sell_leg?: { pairType?: string; pair_type?: string };
  buy_leg?: { pairType?: string; pair_type?: string };
};

const trimString = (value: string | undefined): string =>
  (value || "").trim();

const resolvePairContract = (pair: Record<string, unknown> = {}): string =>
  trimString(
    (pair.pairContract as string) ||
      (pair.pair_contract as string) ||
      (pair.contract as string) ||
      (pair.contractAddress as string) ||
      (pair.contract_address as string) ||
      ""
  );

const resolvePairType = (pair: Record<string, unknown> = {}): string | undefined =>
  trimString(pair.pairType as string) ||
  trimString(pair.pair_type as string) ||
  trimString(pair.type as string) ||
  undefined;

const normalizeRoutePairs = (
  pairs: unknown[] | null | undefined,
  diagnostics?: DiagnosticsInfo
): RoutePairInfo[] => {
  if (!Array.isArray(pairs) || pairs.length === 0) return [];
  const diagSell =
    diagnostics?.sell_leg?.pairType ??
    diagnostics?.sell_leg?.pair_type ??
    undefined;
  const diagBuy =
    diagnostics?.buy_leg?.pairType ??
    diagnostics?.buy_leg?.pair_type ??
    undefined;
  if (pairs.length === 1) {
    const [pair] = pairs as Record<string, unknown>[];
    return [
      {
        pairContract: resolvePairContract(pair),
        pairType: diagSell ?? diagBuy ?? resolvePairType(pair),
      },
    ];
  }
  return (pairs as Record<string, unknown>[]).map((pair, index) => {
    const overrideType =
      index === 0
        ? diagSell
        : index === 1
        ? diagBuy
        : undefined;
    return {
      pairContract: resolvePairContract(pair),
      pairType: overrideType ?? resolvePairType(pair),
    };
  });
};

const toPairType = (value?: string): PairType => {
  const normalized = (value || "")
    .trim()
    .toLowerCase();
  if (!normalized) return { xyk: {} };
  if (normalized.includes("stable")) {
    return { custom: "stable" };
  }
  if (normalized.startsWith("custom-")) {
    const suffix = value?.slice("custom-".length) ?? "";
    if (!suffix.trim()) return { xyk: {} };
    if (suffix.trim().toLowerCase().includes("xyk")) return { xyk: {} };
    return { custom: suffix };
  }
  if (
    normalized === "xyk" ||
    normalized.includes("xyk_") ||
    normalized.includes("xyk-")
  ) {
    return { xyk: {} };
  }
  return { xyk: {} };
};

const isCw20Denom = (denom?: string): boolean => {
  if (!denom) return false;
  const normalized = denom.trim();
  return normalized.startsWith("zig1") && !normalized.includes(".");
};

const buildAssetInfoFromDenom = (denom: string): AssetInfo => {
  const normalized = denom.trim();
  if (!normalized) {
    return { native_token: { denom: "" } };
  }
  if (isCw20Denom(normalized)) {
    return { token: { contract_addr: normalized } };
  }
  return { native_token: { denom: normalized } };
};

const buildRouteSequence = (
  tokens: string[],
  offer: string,
  ask: string
): string[] => {
  const offerDenom = offer.trim();
  const askDenom = ask.trim();
  const cleanedTokens = tokens
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  const deduped = cleanedTokens.reduce<string[]>((acc, token) => {
    if (acc.length > 0 && acc[acc.length - 1] === token) {
      return acc;
    }
    acc.push(token);
    return acc;
  }, []);
  let normalized = [...deduped];

  if (offerDenom && normalized[0] !== offerDenom) {
    normalized = [offerDenom, ...normalized];
  }
  if (askDenom && normalized[normalized.length - 1] !== askDenom) {
    normalized = [...normalized, askDenom];
  }
  if (offerDenom && askDenom && normalized.length < 2) {
    normalized = [offerDenom, askDenom];
  }

  return normalized;
};

const buildOperationsFromRoute = (
  sequence: string[],
  pairs: RoutePairInfo[]
): OroSwapOperation[] => {
  const normalized = sequence
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  if (normalized.length < 2) return [];

  return normalized.slice(0, -1).map((from, index) => {
    const to = normalized[index + 1];
    const pair = pairs[index];
    return {
      offer_asset_info: buildAssetInfoFromDenom(from),
      ask_asset_info: buildAssetInfoFromDenom(to),
      pair_type: toPairType(pair?.pairType),
      pair_address: pair?.pairContract ?? "",
    };
  });
};

const TWAP_STATUS_FAILURE_REGEX = /(fail|error|revert)/i;

type SwapFormProps = {
  initialMode?: SwapMode;
  showModeToggle?: boolean;
  showInlineConnect?: boolean;
  showSlippageControl?: boolean;
  slippagePercent?: number; // controlled slippage from parent
  onSlippageChange?: (percent: number) => void;
  defaultOfferDenom?: string;
  defaultAskDenom?: string;
  defaultPairAddress?: string;
  autoRouteEndpoint?: string; // optional API to auto-populate offer/ask/pair
  cachedForm?: SwapFormCache;
  onFormChange?: (form: SwapFormCache) => void;
  onClear?: () => void;
};


type TokenListItem = {
  denom: string;
  symbol: string;
  exponent: number;
  imageUri?: string;
};


export function SwapForm({
  initialMode = "single",
  showModeToggle = true,
  showInlineConnect = true,
  showSlippageControl = true,
  slippagePercent,
  onSlippageChange,
  defaultOfferDenom,
  defaultAskDenom,
  defaultPairAddress,
  autoRouteEndpoint,
  cachedForm,
  onFormChange,
  onClear,
}: SwapFormProps) {
  const wallet = useWallet();
  const { queryClient, getExecuteClient, queryClientLoading, signingClient } =
    useTwapClients();


  const [singleForm, setSingleForm] = useState<SingleFormCache>(
    cachedForm?.singleForm || {
      offerDenom: "",
      askDenom: "",
      pairAddress: "",
      totalAmount: "",
      chunkCount: "",
      totalMinutes: "",
    }
  );


  const [multiForm, setMultiForm] = useState<MultiFormCache>(
    cachedForm?.multiForm || {
      offerDenom: "",
      askDenom: "",
      totalAmount: "",
      chunkCount: "",
      totalMinutes: "",
      minReceive: "",
    }
  );


  const [mode, setMode] = useState<SwapMode>(cachedForm?.mode || initialMode);
  const [submitState, setSubmitState] = useState<SubmitState>({
    status: "idle",
    message: null,
    txHash: null,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [chunkNotice, setChunkNotice] = useState<string | null>(null);
  const [chunkError, setChunkError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [completionNotified, setCompletionNotified] = useState(false);
  const [orderProgress, setOrderProgress] = useState<{
    completed: number;
    total: number;
    status: string;
  }>({ completed: 0, total: 0, status: "" });
  const [activeOrder, setActiveOrder] = useState<unknown | null>(null);
  const [activeOrderLoading, setActiveOrderLoading] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [cancelMessage, setCancelMessage] = useState<string | null>(null);
  const [orderInFlight, setOrderInFlight] = useState(false);
  const prevCompletedRef = useRef(0);
  const prevFailedChunksRef = useRef(0);
  const orderSubmittedRef = useRef(false);
  const chunkFailureRef = useRef<string | null>(null);
  const notificationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [lastChunkTxHash, setLastChunkTxHash] = useState<string | null>(null);
  const [offerSelectOpen, setOfferSelectOpen] = useState(false);
  const [askSelectOpen, setAskSelectOpen] = useState(false);


  const resetFormFields = useCallback(() => {
    const cleared = {
      mode: "single" as SwapMode,
      singleForm: {
        offerDenom: "",
        askDenom: "",
        pairAddress: "",
        totalAmount: "",
        chunkCount: "",
        totalMinutes: "",
      },
      multiForm: {
        offerDenom: "",
        askDenom: "",
        totalAmount: "",
        chunkCount: "",
        totalMinutes: "",
        minReceive: "",
      },
    };
    setMode(cleared.mode);
    setSingleForm(cleared.singleForm);
    setMultiForm(cleared.multiForm);
    setOrderProgress({ completed: 0, total: 0, status: "" });
    prevCompletedRef.current = 0;
    prevFailedChunksRef.current = 0;
    lastCachedFormRef.current = cleared;
    setChunkError(null);
    chunkFailureRef.current = null;
    if (onFormChange) onFormChange(cleared);
  }, [onFormChange]);


  const showNotification = useCallback((message: string, type: "success" | "error") => {
    if (notificationTimerRef.current) {
      clearTimeout(notificationTimerRef.current);
    }
    setNotification({ type, message });
    notificationTimerRef.current = setTimeout(() => {
      setNotification(null);
    }, 6000);
  }, []);

  const notifyChunkFailure = useCallback(
    (
      message: string,
      completed: number,
      total: number,
      txHash: string | null = null,
      forceAlert = false
    ) => {
      const normalized = (message?.trim() || "Chunk failed").trim();
      if (!forceAlert && chunkFailureRef.current === normalized) return;
      chunkFailureRef.current = normalized;
      setChunkError(normalized);
      setChunkNotice(null);
      setSubmitState((prev) => ({
        status: "error",
        message: normalized,
        txHash: prev.txHash ?? txHash ?? null,
      }));
      setOrderInFlight(false);
      orderSubmittedRef.current = false;
      dispatchTwapChunkEvent({
        status: "failure",
        completed,
        total,
        txHash,
      });
      showNotification(normalized, "error");
    },
    [showNotification]
  );

  useEffect(() => {
    return () => {
      if (notificationTimerRef.current) {
        clearTimeout(notificationTimerRef.current);
      }
    };
  }, []);


  const lastCachedFormRef = useRef<SwapFormCache | undefined>(cachedForm);


  useEffect(() => {
    if (cachedForm && Object.keys(cachedForm).length > 0) {
      const isDifferent =
        !lastCachedFormRef.current ||
        cachedForm.mode !== lastCachedFormRef.current.mode ||
        JSON.stringify(cachedForm.singleForm) !==
          JSON.stringify(lastCachedFormRef.current.singleForm) ||
        JSON.stringify(cachedForm.multiForm) !==
          JSON.stringify(lastCachedFormRef.current.multiForm);


      if (isDifferent) {
        lastCachedFormRef.current = cachedForm;
        setMode(cachedForm.mode);
        setSingleForm(cachedForm.singleForm);
        setMultiForm(cachedForm.multiForm);
      }
    }
  }, [cachedForm]);


  useEffect(() => {
    if (onFormChange && lastCachedFormRef.current) {
      const formChanged =
        mode !== lastCachedFormRef.current.mode ||
        JSON.stringify(singleForm) !==
          JSON.stringify(lastCachedFormRef.current.singleForm) ||
        JSON.stringify(multiForm) !==
          JSON.stringify(lastCachedFormRef.current.multiForm);


      if (formChanged) {
        const updated = {
          mode,
          singleForm,
          multiForm,
        };
        lastCachedFormRef.current = updated;
        onFormChange(updated);
      }
    } else if (onFormChange && !lastCachedFormRef.current) {
      const updated = {
        mode,
        singleForm,
        multiForm,
      };
      lastCachedFormRef.current = updated;
      onFormChange(updated);
    }
  }, [mode, singleForm, multiForm, onFormChange]);


  const isConnected = wallet.isConnected && Boolean(wallet.address);


  const spreadMenuRef = useRef<HTMLDivElement | null>(null);
  const [spreadMenuOpen, setSpreadMenuOpen] = useState(false);
  const [currentSpreadPercent, setCurrentSpreadPercent] = useState<number>(0.5);
  const [customSpreadPercent, setCustomSpreadPercent] = useState<number>(0.5);
  const [isCustomSpread, setIsCustomSpread] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const routeLoadedRef = useRef(false);
  const [tokenList, setTokenList] = useState<TokenListItem[]>([
    { denom: "uzig", symbol: "ZIG", exponent: 6 },
    // Add more tokens as needed
  ]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [bankClient, setBankClient] = useState<any>(null);
  const [routePairs, setRoutePairs] = useState<RoutePairInfo[]>([]);
  const [routeTokens, setRouteTokens] = useState<string[]>([]);
  // const prevCompletedRef = useRef(0);


  const internalSpreadPercent = useMemo(() => {
    const value = isCustomSpread ? customSpreadPercent : currentSpreadPercent;
    return Number.isFinite(value) ? value : 0;
  }, [customSpreadPercent, currentSpreadPercent, isCustomSpread]);
  const effectiveSpreadPercent = useMemo(() => {
    if (typeof slippagePercent === "number") return slippagePercent;
    return internalSpreadPercent;
  }, [internalSpreadPercent, slippagePercent]);


  const sliderFillPercent = useMemo(() => {
    const clamped = Math.min(Math.max(customSpreadPercent, 0), 50);
    return clamped * 2;
  }, [customSpreadPercent]);


  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!spreadMenuRef.current) return;
      if (!spreadMenuRef.current.contains(event.target as Node)) {
        setSpreadMenuOpen(false);
      }
    }


    if (spreadMenuOpen) {
      document.addEventListener("mousedown", handleClick);
    }


    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [spreadMenuOpen]);


  const handleSelectPresetSpread = useCallback(
    (percent: number) => {
      if (onSlippageChange) {
        onSlippageChange(percent);
      } else {
        setCurrentSpreadPercent(percent);
        setIsCustomSpread(false);
      }
      setSpreadMenuOpen(false);
    },
    [onSlippageChange]
  );


  const handleApplyCustomSpread = useCallback(() => {
    const clamped = Math.min(Math.max(customSpreadPercent, 0), 50);
    if (onSlippageChange) {
      onSlippageChange(clamped);
    } else {
      setCustomSpreadPercent(clamped);
      setCurrentSpreadPercent(clamped);
      setIsCustomSpread(true);
    }
    setSpreadMenuOpen(false);
  }, [customSpreadPercent]);


  const walletLabel = useMemo(() => {
    if (wallet.status === WalletStatus.Connecting) {
      return "Connecting…";
    }
    if (wallet.status === WalletStatus.Connected && isConnected) {
      return wallet.shortAddress || wallet.address || "Connected";
    }
    if (wallet.status === WalletStatus.Rejected) {
      return "Retry Connection";
    }
    if (wallet.status === WalletStatus.Error) {
      return "Retry Wallet";
    }
    return "Connect Wallet";
  }, [isConnected, wallet.address, wallet.shortAddress, wallet.status]);


  const handleWalletClick = async () => {
    if (wallet.isConnected) {
      await wallet.disconnect?.();
      return;
    }
    wallet.openView?.();
  };


  const canSubmit = useMemo(() => {
    if (!isConnected) return false;
    if (mode === "single") {
      return (
        singleForm.offerDenom.trim().length > 0 &&
        singleForm.askDenom.trim().length > 0 &&
        singleForm.pairAddress.trim().length > 0 &&
        singleForm.totalAmount.trim().length > 0
      );
    }
    return (
      multiForm.offerDenom.trim().length > 0 &&
      multiForm.askDenom.trim().length > 0 &&
      multiForm.totalAmount.trim().length > 0 &&
      multiForm.chunkCount.trim().length > 0 &&
      multiForm.totalMinutes.trim().length > 0
    );
  }, [isConnected, mode, multiForm, singleForm]);


  const handleSingleChange = (
    field: keyof typeof singleForm,
    value: string
  ) => {
    setSingleForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };


  const handleMultiChange = (field: keyof typeof multiForm, value: string) => {
    setMultiForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };


  const offerDenom =
    mode === "single" ? singleForm.offerDenom : multiForm.offerDenom;
  const askDenom = mode === "single" ? singleForm.askDenom : multiForm.askDenom;
  const trimmedOfferDenom = offerDenom.trim();
  const trimmedAskDenom = askDenom.trim();
  const pairAddress =
    mode === "single" ? singleForm.pairAddress.trim() : null;
  const totalAmountValue =
    mode === "single" ? singleForm.totalAmount : multiForm.totalAmount;
  const offerMeta = tokenList.find((t) => t.denom === trimmedOfferDenom);
  const askMeta = tokenList.find((t) => t.denom === trimmedAskDenom);
  const offerBalance = balances[trimmedOfferDenom] ?? 0;
  const fmt = (n: number, d = 6) =>
    Number.isFinite(n) ? n.toFixed(d) : "0.000000";
  const [receiveEstimate, setReceiveEstimate] = useState<string>("");
  const routeSequence = useMemo(
    () => buildRouteSequence(routeTokens, trimmedOfferDenom, trimmedAskDenom),
    [routeTokens, trimmedOfferDenom, trimmedAskDenom]
  );
  const routeLabel = useMemo(() => {
    if (routeSequence.length <= 1) return "";
    return routeSequence
      .map(
        (token) => tokenList.find((t) => t.denom === token)?.symbol ?? token
      )
      .join(" → ");
  }, [routeSequence, tokenList]);
  const [offerSearch, setOfferSearch] = useState("");
  const [askSearch, setAskSearch] = useState("");
  const filteredOfferTokens = useMemo(() => {
    const lower = offerSearch.toLowerCase();
    return tokenList.filter(
      (token) =>
        (token.symbol.toLowerCase().includes(lower) ||
          token.denom.toLowerCase().includes(lower)) &&
        token.denom !== trimmedAskDenom
    );
  }, [offerSearch, tokenList, trimmedAskDenom]);
  const filteredAskTokens = useMemo(() => {
    const lower = askSearch.toLowerCase();
    return tokenList.filter(
      (token) =>
        (token.symbol.toLowerCase().includes(lower) ||
          token.denom.toLowerCase().includes(lower)) &&
        token.denom !== trimmedOfferDenom
    );
  }, [askSearch, tokenList, trimmedOfferDenom]);
  const handleSelectOfferToken = useCallback(
    (denom: string) => {
      if (mode === "single") {
        handleSingleChange("offerDenom", denom);
      } else {
        handleMultiChange("offerDenom", denom);
      }
      setOfferSearch("");
      setOfferSelectOpen(false);
    },
    [handleSingleChange, handleMultiChange, mode]
  );
  const handleSelectAskToken = useCallback(
    (denom: string) => {
      if (mode === "single") {
        handleSingleChange("askDenom", denom);
      } else {
        handleMultiChange("askDenom", denom);
      }
      setAskSearch("");
      setAskSelectOpen(false);
    },
    [handleSingleChange, handleMultiChange, mode]
  );


  const handleMaxClick = useCallback(() => {
    if (offerBalance <= 0) return;


    const decimals = getTokenDecimals(offerMeta);
    // Convert the balance to base units (smallest unit) before BigInt conversion
    const balanceInBaseUnits = Math.floor(
      offerBalance * Math.pow(10, decimals)
    );


    // Leave some balance for gas fees (0.1 ZIG) if the token is ZIG
    const gasBuffer =
      trimmedOfferDenom === DEFAULT_BALANCE_DENOM ? BigInt(100000) : BigInt(0);
    const adjustedBalance =
      BigInt(balanceInBaseUnits) > gasBuffer
        ? BigInt(balanceInBaseUnits) - gasBuffer
        : BigInt(balanceInBaseUnits);


    // Convert back to human-readable amount
    const amount = (
      Number(adjustedBalance) / Math.pow(10, decimals)
    ).toString();


    if (mode === "single") {
      handleSingleChange("totalAmount", amount);
    } else {
      handleMultiChange("totalAmount", amount);
    }
  }, [offerBalance, offerMeta, offerDenom, mode]);


  useEffect(() => {
    const loadTokens = async () => {
      try {
        // Add your token loading logic here
        // For now, we'll use a static list
        setTokenList([
          { denom: "uzig", symbol: "ZIG", exponent: 6 },
          // Add more tokens as needed
        ]);
      } catch (error) {
        console.error("Failed to load tokens:", error);
      }
    };


    loadTokens();
  }, []);


  // token list (for symbol/decimals) + balances (native & cw20)
  useEffect(() => {
    if (!API_BASE) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/tokens/swap-list`, {
          headers: API_HEADERS,
        });
        const json = await res.json();
        const list: TokenListItem[] = Array.isArray(json?.data)
          ? json.data
          : [];
        setTokenList(list);
      } catch (e) {
        console.warn("[twap swap-list] failed", e);
      }
    })();
  }, []);


  useEffect(() => {
    if (bankClient) return;
    (async () => {
      try {
        const { CosmWasmClient } = await import("@cosmjs/cosmwasm-stargate");
        const client = await CosmWasmClient.connect(RPC_URL);
        setBankClient(client);
      } catch (e) {
        console.warn("[twap bank client] failed", e);
      }
    })();
  }, [bankClient]);


  const loadBalanceFor = useCallback(
    async (denom: string) => {
      if (!wallet.address || !bankClient) return;
      try {
        const meta = tokenList.find((t) => t.denom === denom);
        const decimals = getTokenDecimals(meta);
        const isCw20 = denom.startsWith("zig1");


        if (isCw20) {
          const resp: any = await bankClient.queryContractSmart(denom, {
            balance: { address: wallet.address },
          });
          const got = resp?.balance ?? "0";
          const val =
            decimals === 0 ? Number(got) : Number(got) / Math.pow(10, decimals);
          setBalances((prev) => ({ ...prev, [denom]: val }));
        } else {
          const coin = await bankClient.getBalance(wallet.address, denom);
          const got = coin?.amount ?? "0";
          const val =
            decimals === 0 ? Number(got) : Number(got) / Math.pow(10, decimals);
          setBalances((prev) => ({ ...prev, [denom]: val }));
        }
      } catch (e) {
        console.warn("[twap balance] failed", e);
      }
    },
    [bankClient, tokenList, wallet.address]
  );


  // Sync defaults from parent (API route) when provided
  useEffect(() => {
    const nextSingle = { ...singleForm };
    let changed = false;
    if (defaultOfferDenom && defaultOfferDenom !== singleForm.offerDenom) {
      nextSingle.offerDenom = defaultOfferDenom;
      changed = true;
    }
    if (defaultAskDenom && defaultAskDenom !== singleForm.askDenom) {
      nextSingle.askDenom = defaultAskDenom;
      changed = true;
    }
    if (defaultPairAddress && defaultPairAddress !== singleForm.pairAddress) {
      nextSingle.pairAddress = defaultPairAddress;
      changed = true;
    }
    if (changed) {
      setSingleForm(nextSingle);
    }


    const nextMulti = { ...multiForm };
    let multiChanged = false;
    if (defaultOfferDenom && defaultOfferDenom !== multiForm.offerDenom) {
      nextMulti.offerDenom = defaultOfferDenom;
      multiChanged = true;
    }
    if (defaultAskDenom && defaultAskDenom !== multiForm.askDenom) {
      nextMulti.askDenom = defaultAskDenom;
      multiChanged = true;
    }
    if (multiChanged) {
      setMultiForm(nextMulti);
    }
  }, [defaultOfferDenom, defaultAskDenom, defaultPairAddress]);


  // Auto-fetch route data to prefill offer/ask/pair when provided an endpoint
  useEffect(() => {
    if (!autoRouteEndpoint || routeLoadedRef.current) return;
    // only fetch once per mount
    routeLoadedRef.current = true;
    setRouteLoading(true);
    (async () => {
      try {
        const res = await fetch(autoRouteEndpoint, { headers: API_HEADERS });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const data = json?.data || {};
        const route = Array.isArray(data.route) ? data.route : [];
        const pairs = Array.isArray(data.pairs) ? data.pairs : [];
        const diag = data?.diagnostics as DiagnosticsInfo | undefined;


        const offer = route[0] || "";
        const ask = route[route.length - 1] || "";
        const pairAddr = pairs[0]?.pairContract || "";
        const normalizedRouteTokens = route
          .map((token: any) => String(token ?? "").trim())
          .filter((token: string | any[]) => token.length > 0);


        const nextSingle = { ...singleForm };
        let changedSingle = false;
        if (offer && !nextSingle.offerDenom) {
          nextSingle.offerDenom = offer;
          changedSingle = true;
        }
        if (ask && !nextSingle.askDenom) {
          nextSingle.askDenom = ask;
          changedSingle = true;
        }
        if (pairAddr && !nextSingle.pairAddress) {
          nextSingle.pairAddress = pairAddr;
          changedSingle = true;
        }
        if (changedSingle) setSingleForm(nextSingle);


        const nextMulti = { ...multiForm };
        let changedMulti = false;
        if (offer && !nextMulti.offerDenom) {
          nextMulti.offerDenom = offer;
          changedMulti = true;
        }
        if (ask && !nextMulti.askDenom) {
          nextMulti.askDenom = ask;
          changedMulti = true;
        }
        if (changedMulti) setMultiForm(nextMulti);
        setRoutePairs(normalizeRoutePairs(pairs, diag));
        setRouteTokens(normalizedRouteTokens);
      } catch (e) {
        console.warn("[twap auto route] failed", e);
        setRoutePairs([]);
        setRouteTokens([]);
      } finally {
        setRouteLoading(false);
      }
    })();
  }, [autoRouteEndpoint, singleForm, multiForm]);


  // When offer/ask are known, fetch route + pair from API (same as swap)
  useEffect(() => {
    if (!API_BASE) return;
    if (!offerDenom || !askDenom) {
      setRoutePairs([]);
      setRouteTokens([]);
      return;
    }
    setRouteLoading(true);
    (async () => {
      try {
        const url = `${API_BASE}/swap?from=${encodeURIComponent(
          offerDenom
        )}&to=${encodeURIComponent(askDenom)}`;
        const res = await fetch(url, { headers: API_HEADERS });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const data = json?.data || {};
        const route = Array.isArray(data.route) ? data.route : [];
        const pairs = Array.isArray(data.pairs) ? data.pairs : [];
        const diag = data?.diagnostics as DiagnosticsInfo | undefined;


        const nextOffer = route[0] || offerDenom;
        const nextAsk = route[route.length - 1] || askDenom;
        const pairAddr = pairs[0]?.pairContract || "";
        const normalizedRouteTokens = route
          .map((token: any) => String(token ?? "").trim())
          .filter((token: string | any[]) => token.length > 0);


        setSingleForm((prev) => ({
          ...prev,
          offerDenom: prev.offerDenom || nextOffer,
          askDenom: prev.askDenom || nextAsk,
          pairAddress: prev.pairAddress || pairAddr,
        }));
        setMultiForm((prev) => ({
          ...prev,
          offerDenom: prev.offerDenom || nextOffer,
          askDenom: prev.askDenom || nextAsk,
        }));
        setRoutePairs(normalizeRoutePairs(pairs, diag));
        setRouteTokens(normalizedRouteTokens);
      } catch (e) {
        console.warn("[twap route fetch] failed", e);
        setRoutePairs([]);
        setRouteTokens([]);
      } finally {
        setRouteLoading(false);
      }
    })();
  }, [offerDenom, askDenom]);


  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();


    if (!isConnected || !wallet.address) {
      setSubmitState({
        status: "error",
        message: "Connect your wallet to submit an order.",
        txHash: null,
      });
      return;
    }


    const selectedMode = mode;


    if (!queryClient) {
      setSubmitState({
        status: "error",
        message: "Contract client not ready. Please try again in a moment.",
        txHash: null,
      });
      return;
    }


    try {
      setIsSubmitting(true);
      setSubmitState({
        status: "pending",
        message: "Submitting order…",
        txHash: null,
      });


      const configResponse = await queryClient.config();
      const config = configResponse.config as {
        gas_fee_per_chunk?: { amount: string; denom: string };
      };


      const executeClient = await getExecuteClient();


      if (selectedMode === "single") {
        const offerDenom = singleForm.offerDenom.trim();
        const askDenom = singleForm.askDenom.trim();
        const pairAddress = singleForm.pairAddress.trim();
        const totalAmount = singleForm.totalAmount.trim();
        const chunkCountValue = singleForm.chunkCount.trim();
        const totalMinutesValue = singleForm.totalMinutes.trim();


        if (!offerDenom || !askDenom || !pairAddress || !totalAmount) {
          throw new Error("All required fields must be filled in.");
        }


        if (!isValidDisplayAmount(totalAmount)) {
          throw new Error(
            "Total amount must be a valid positive number (e.g., 0.1 or 1.5)."
          );
        }


        const totalAmountRaw = toRawAmount(
          totalAmount,
          getTokenDecimals(offerMeta)
        );


        const chunkCount = Number(chunkCountValue);
        if (!Number.isInteger(chunkCount) || chunkCount <= 0) {
          throw new Error("Chunk count must be a positive integer.");
        }


        const totalMinutes = Number(totalMinutesValue);
        if (!Number.isInteger(totalMinutes) || totalMinutes <= 0) {
          throw new Error(
            "Total duration must be a positive integer (minutes)."
          );
        }


        const gasFeePerChunk = BigInt(config.gas_fee_per_chunk?.amount ?? "0");
        const totalGasFee = (gasFeePerChunk * BigInt(chunkCount)).toString();


        const funds: Coin[] = [];
        if (offerDenom === DEFAULT_BALANCE_DENOM) {
          const combined = (
            BigInt(totalAmountRaw) + BigInt(totalGasFee)
          ).toString();
          funds.push({ denom: DEFAULT_BALANCE_DENOM, amount: combined });
        } else {
          funds.push({ denom: offerDenom, amount: totalAmountRaw });
          funds.push({ denom: DEFAULT_BALANCE_DENOM, amount: totalGasFee });
        }


        const minReceiveInput = "0";
        const selectedPercent = effectiveSpreadPercent;
        const maxSpreadInput = (selectedPercent / 100)
          .toFixed(4)
          .replace(/0+$/u, "")
          .replace(/\.$/u, "");
        const fee = await buildSimulatedFee(
          wallet.address,
          signingClient,
          {
            create_twap_order: {
              offer_denom: offerDenom,
              ask_denom: askDenom,
              pair_address: pairAddress,
              total_amount: totalAmountRaw,
              chunk_count: chunkCount,
              total_time_minutes: totalMinutes,
              min_receive: minReceiveInput,
              max_spread: maxSpreadInput.length > 0 ? maxSpreadInput : null,
              operations: [],
            },
          },
          funds,
          CREATE_GAS_FALLBACK,
          CREATE_BUFFER
        );


        const response = (await executeClient.createTwapOrder(
          {
            offerDenom,
            askDenom,
            pairAddress,
            totalAmount: totalAmountRaw,
            chunkCount,
            totalTimeMinutes: totalMinutes,
            minReceive: minReceiveInput,
            maxSpread: maxSpreadInput.length > 0 ? maxSpreadInput : null,
            operations: [],
          },
          fee,
          undefined,
          funds
        )) as DeliverTxResponse;


        const txHash = response?.transactionHash ?? null;


        setSubmitState({
          status: "success",
          message: "Order submitted. Await confirmation on-chain.",
          txHash,
        });
        setOrderInFlight(true);
        orderSubmittedRef.current = true;
        setCompletionNotified(false);
        setChunkNotice(null);
        prevCompletedRef.current = 0;
        prevFailedChunksRef.current = 0;
        chunkFailureRef.current = null;
        setChunkError(null);
        prevFailedChunksRef.current = 0;
        chunkFailureRef.current = null;
        setChunkError(null);
      } else {
        const offerDenom = multiForm.offerDenom.trim();
        const askDenom = multiForm.askDenom.trim();
        const totalAmount = multiForm.totalAmount.trim();
        const chunkCountValue = multiForm.chunkCount.trim();
        const totalMinutesValue = multiForm.totalMinutes.trim();


        if (!offerDenom || !askDenom || !totalAmount) {
          throw new Error("All required fields must be filled in.");
        }


        if (!isValidDisplayAmount(totalAmount)) {
          throw new Error(
            "Total amount must be a valid positive number (e.g., 0.1 or 1.5)."
          );
        }


        const totalAmountRaw = toRawAmount(
          totalAmount,
          getTokenDecimals(offerMeta)
        );


        const chunkCount = Number(chunkCountValue);
        if (!Number.isInteger(chunkCount) || chunkCount <= 0) {
          throw new Error("Chunk count must be a positive integer.");
        }


        const totalMinutes = Number(totalMinutesValue);
        if (!Number.isInteger(totalMinutes) || totalMinutes <= 0) {
          throw new Error(
            "Total duration must be a positive integer (minutes)."
          );
        }


        const gasFeePerChunk = BigInt(config.gas_fee_per_chunk?.amount ?? "0");
        const totalGasFee = (gasFeePerChunk * BigInt(chunkCount)).toString();


        const funds: Coin[] = [];
        if (offerDenom === DEFAULT_BALANCE_DENOM) {
          const combined = (
            BigInt(totalAmountRaw) + BigInt(totalGasFee)
          ).toString();
          funds.push({ denom: DEFAULT_BALANCE_DENOM, amount: combined });
        } else {
          funds.push({ denom: offerDenom, amount: totalAmountRaw });
          funds.push({ denom: DEFAULT_BALANCE_DENOM, amount: totalGasFee });
        }


        const minReceiveInput = multiForm.minReceive.trim();
        const selectedPercent = effectiveSpreadPercent;
        const maxSpreadInput = (selectedPercent / 100)
          .toFixed(4)
          .replace(/0+$/u, "")
          .replace(/\.$/u, "");


        const routeLength = Math.max(routeSequence.length - 1, 0);
        const useComputedRoute = routePairs.length >= routeLength;
        const hasDirectPair = routePairs.length === 1 && routeLength === 1;
        const fallbackOperation: OroSwapOperation = {
          offer_asset_info: buildAssetInfoFromDenom(trimmedOfferDenom),
          ask_asset_info: buildAssetInfoFromDenom(trimmedAskDenom),
          pair_type: hasDirectPair
            ? toPairType(routePairs[0]?.pairType)
            : { xyk: {} },
          pair_address: hasDirectPair ? routePairs[0]?.pairContract ?? "" : "",
        };
        const operations = useComputedRoute
          ? buildOperationsFromRoute(routeSequence, routePairs)
          : [fallbackOperation];
        if (operations.length === 0) {
          throw new Error("Unable to construct a multi-hop route for the pair.");
        }


        const fee = await buildSimulatedFee(
          wallet.address,
          signingClient,
          {
            create_twap_order: {
              offer_denom: offerDenom,
              ask_denom: askDenom,
              pair_address: null,
              total_amount: totalAmountRaw,
              chunk_count: chunkCount,
              total_time_minutes: totalMinutes,
              min_receive: minReceiveInput.length > 0 ? minReceiveInput : null,
              max_spread: maxSpreadInput.length > 0 ? maxSpreadInput : null,
              operations,
            },
          },
          funds,
          MULTI_CREATE_GAS_FALLBACK,
          MULTI_BUFFER
        );


        const response = (await executeClient.createTwapOrder(
          {
            offerDenom,
            askDenom,
            pairAddress: null,
            totalAmount: totalAmountRaw,
            chunkCount,
            totalTimeMinutes: totalMinutes,
            minReceive: minReceiveInput.length > 0 ? minReceiveInput : null,
            maxSpread: maxSpreadInput.length > 0 ? maxSpreadInput : null,
            operations,
          },
          fee,
          undefined,
          funds
        )) as DeliverTxResponse;


        const txHash = response?.transactionHash ?? null;


        setSubmitState({
          status: "success",
          message: "Order submitted. Await confirmation on-chain.",
          txHash,
        });
        setOrderInFlight(true);
        orderSubmittedRef.current = true;
        setCompletionNotified(false);
        setChunkNotice(null);
        prevCompletedRef.current = 0;
      }


      await refreshActiveOrder();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to submit order.";
      setSubmitState({ status: "error", message, txHash: null });
      setOrderInFlight(false);
    } finally {
      setIsSubmitting(false);
    }
  };


  const refreshActiveOrder = useCallback(async () => {
    if (!queryClient || !wallet.address) {
      setActiveOrder(null);
      setOrderInFlight(false);
      setOrderProgress({ completed: 0, total: 0, status: "" });
      return;
    }


    setActiveOrderLoading(true);
    try {
      const result = await queryClient.order(wallet.address);
      const responseWithOrder = result as { order?: unknown };
      const hasOrderProp =
        responseWithOrder &&
        Object.prototype.hasOwnProperty.call(responseWithOrder, "order");
      const candidateOrder = hasOrderProp ? responseWithOrder.order : result;
      const hasOrderData =
        candidateOrder !== null &&
        typeof candidateOrder === "object" &&
        Object.keys(candidateOrder as Record<string, unknown>).length > 0;
      const orderPayload = hasOrderData ? candidateOrder : null;
      setActiveOrder(orderPayload);
      const ord = orderPayload as any;
      const completed =
        Number(
          ord?.completed_chunks ??
            ord?.chunks_executed ??
            ord?.chunks_done ??
            ord?.executed_chunks ??
            ord?.completed ??
            0
        ) || 0;
      const total =
        Number(
          ord?.chunk_count ??
            ord?.total_chunks ??
            ord?.chunks_total ??
            ord?.total_chunk_count ??
            ord?.chunkTotal ??
            ord?.total ??
            0
        ) || 0;
      const statusStr = String(
        ord?.status ?? ord?.state ?? ord?.order_status ?? ""
      ).toLowerCase();
      setOrderProgress({ completed, total, status: statusStr });

      const failed =
        Number(
          ord?.failed_chunks ??
            ord?.chunks_failed ??
            ord?.failed ??
            ord?.failed_chunks_count ??
            0
        ) || 0;

      const failureTx =
        ord?.last_execution_tx ??
        ord?.last_tx_hash ??
        ord?.completion_tx ??
        null;

      const hasFailure = TWAP_STATUS_FAILURE_REGEX.test(statusStr);
      if (hasFailure) {
        const rawFailure =
          ord?.error ?? ord?.message ?? ord?.reason ?? statusStr ?? "";
        const normalizedFailure = String(rawFailure ?? "").trim();
        const failureMessage =
          normalizedFailure && normalizedFailure !== "undefined"
            ? normalizedFailure
            : "Chunk failed";
        notifyChunkFailure(failureMessage, completed, total, failureTx);
      } else if (failed > prevFailedChunksRef.current) {
        notifyChunkFailure("Chunk failed", completed, total, failureTx, true);
      }
      prevFailedChunksRef.current = failed;

      const isFinished =
        statusStr.includes("complete") ||
        statusStr.includes("finish") ||
        statusStr.includes("done") ||
        (total > 0 && completed >= total);


      if (completed > prevCompletedRef.current) {
        prevCompletedRef.current = completed;
        const totalLabel = total > 0 ? `/${total}` : "";
        setChunkNotice(
          `Chunk ${completed}${totalLabel} executed successfully.`
        );
        // Logging chunk progress with best-known tx hash (if present)
        const chunkTx =
          ord?.last_execution_tx ?? ord?.last_tx_hash ?? ord?.completion_tx;
        if (chunkTx) setLastChunkTxHash(chunkTx);
        const successTx = chunkTx ?? submitState.txHash ?? null;
        dispatchTwapChunkEvent({
          status: "success",
          completed,
          total,
          txHash: successTx,
        });
        showNotification(
          `Chunk ${completed}${totalLabel} executed successfully.`,
          "success"
        );
        chunkFailureRef.current = null;
        setChunkError(null);
        // console.info(
        //   "[TWAP] chunk executed",
        //   { completed, total, status: statusStr },
        //   chunkTx ? { txHash: chunkTx } : {}
        // );
        setTimeout(() => setChunkNotice(null), 6500);
      }


      const shouldFinalize =
        !chunkFailureRef.current &&
        (isFinished ||
          (!orderPayload && (orderInFlight || orderSubmittedRef.current)));


      if (shouldFinalize) {
        const completionTx =
          lastChunkTxHash ??
          ord?.last_execution_tx ??
          ord?.last_tx_hash ??
          ord?.completion_tx ??
          submitState.txHash;
        // console.info("[TWAP] order completed", {
        //   completed,
        //   total,
        //   status: statusStr,
        //   txHash: completionTx ?? "unknown",
        // });
        setSubmitState({
          status: "success",
          message: `TWAP swap successful${
            total ? ` (${completed}/${total} chunks)` : ""
          }.`,
          txHash: completionTx ?? null,
        });
        setOrderInFlight(false);
        setCompletionNotified(true);
        setChunkNotice(null);
        resetFormFields();
        setActiveOrder(null);
        orderSubmittedRef.current = false;
        setLastChunkTxHash(null);
      } else {
        setOrderInFlight(Boolean(orderPayload) && !chunkFailureRef.current);
      }
      setCancelMessage(null);
    } catch (error: unknown) {
      console.warn("Failed to load active order", error);
      setActiveOrder(null);
      const errorMessage =
        error instanceof Error ? error.message : String(error ?? "");
      if (
        orderSubmittedRef.current &&
        /order not found|unknown request/i.test(errorMessage)
      ) {
        setSubmitState({
          status: "error",
          message:
            "Order not found on-chain. It may not have been recorded. Please retry or check the transaction.",
          txHash: submitState.txHash ?? null,
        });
        setOrderInFlight(false);
        setCompletionNotified(false);
        setChunkNotice(null);
        orderSubmittedRef.current = false;
        setLastChunkTxHash(null);
      } else {
        setOrderInFlight(false);
      }
      setOrderProgress({ completed: 0, total: 0, status: "" });
    } finally {
      setActiveOrderLoading(false);
    }
  }, [
    queryClient,
    wallet.address,
    orderInFlight,
    submitState.txHash,
    resetFormFields,
    lastChunkTxHash,
    notifyChunkFailure,
    showNotification,
  ]);


  useEffect(() => {
    refreshActiveOrder();
  }, [refreshActiveOrder, signingClient]);


  useEffect(() => {
    if (!wallet.address || !queryClient) return;
    if (!orderInFlight && !activeOrder) return;
    const interval = setInterval(() => {
      refreshActiveOrder().catch(() => void 0);
    }, 10_000);
    return () => clearInterval(interval);
  }, [
    wallet.address,
    queryClient,
    orderInFlight,
    activeOrder,
    refreshActiveOrder,
  ]);


  const handleCancelOrder = useCallback(async () => {
    if (!wallet.address) {
      setCancelMessage("Connect your wallet to cancel the order.");
      return;
    }
    try {
      setCanceling(true);
      setCancelMessage(null);
      const executeClient = await getExecuteClient();
      const fee = await buildSimulatedFee(
        wallet.address,
        signingClient,
        { cancel_order: {} },
        [],
        CANCEL_GAS_FALLBACK,
        CANCEL_BUFFER
      );
      await executeClient.cancelOrder(fee);
      setCancelMessage("Cancellation submitted. Await confirmation on-chain.");
      await refreshActiveOrder();
    } catch (error) {
      setCancelMessage(
        error instanceof Error ? error.message : "Failed to cancel order."
      );
    } finally {
      setCanceling(false);
    }
  }, [getExecuteClient, wallet.address, refreshActiveOrder]);


  const isCompleted =
    completionNotified ||
    orderProgress.status.includes("complete") ||
    orderProgress.status.includes("finish") ||
    orderProgress.status.includes("done") ||
    (orderProgress.total > 0 &&
      orderProgress.completed > 0 &&
      orderProgress.completed >= orderProgress.total);


  const hasActiveOrderData =
    Boolean(activeOrder) &&
    typeof activeOrder === "object" &&
    Object.keys(activeOrder || {}).length > 0;
  const shouldShowCancel =
    !isCompleted &&
    !activeOrderLoading &&
    (orderInFlight || hasActiveOrderData);


  const inactiveStatusMessage = useMemo(() => {
    if (shouldShowCancel) return null;
    return activeOrderLoading
      ? "Checking active order…"
      : "No active order detected.";
  }, [activeOrderLoading, shouldShowCancel]);


  const handleFlipDenoms = useCallback(() => {
    if (mode === "single") {
      setSingleForm((prev) => ({
        ...prev,
        offerDenom: prev.askDenom,
        askDenom: prev.offerDenom,
      }));
    } else {
      setMultiForm((prev) => ({
        ...prev,
        offerDenom: prev.askDenom,
        askDenom: prev.offerDenom,
      }));
    }
  }, [mode]);


  const handleClear = () => {
    resetFormFields();
    setSubmitState({ status: "idle", message: null, txHash: null });
    setChunkNotice(null);
    setCompletionNotified(false);
    if (onClear) onClear();
  };


  useEffect(() => {
    if (trimmedOfferDenom) void loadBalanceFor(trimmedOfferDenom);
  }, [trimmedOfferDenom, loadBalanceFor]);


  useEffect(() => {
    if (trimmedAskDenom) void loadBalanceFor(trimmedAskDenom);
  }, [trimmedAskDenom, loadBalanceFor]);


  // Quote receive estimate using pair simulation (single-hop)
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!bankClient || !pairAddress) {
        setReceiveEstimate("");
        return;
      }
      const amt = Number.parseFloat(totalAmountValue || "0");
      if (!(amt > 0)) {
        setReceiveEstimate("");
        return;
      }
      try {
        const offerDecimals = getTokenDecimals(offerMeta);
        const askDecimals = getTokenDecimals(askMeta);
        const amountInMicro =
          offerDecimals === 0
            ? Math.round(amt).toString()
            : Math.round(amt * Math.pow(10, offerDecimals)).toString();
        const offer_asset = offerDenom.startsWith("zig1")
          ? {
              amount: amountInMicro,
              info: { token: { contract_addr: offerDenom } },
            }
          : {
              amount: amountInMicro,
              info: { native_token: { denom: offerDenom } },
            };
        const sim: any = await bankClient.queryContractSmart(pairAddress, {
          simulation: { offer_asset },
        });
        const returnMicro = sim?.return_amount ?? "0";
        const outNum =
          askDecimals === 0
            ? Number(returnMicro)
            : Number(returnMicro) / Math.pow(10, askDecimals);
        if (!cancelled) {
          setReceiveEstimate(
            Number.isFinite(outNum)
              ? outNum.toFixed(Math.min(6, askDecimals))
              : ""
          );
        }
      } catch {
        if (!cancelled) setReceiveEstimate("");
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    bankClient,
    pairAddress,
    totalAmountValue,
    offerDenom,
    askDenom,
    offerMeta,
    askMeta,
  ]);


  return (
    <section className="relative bg-black/30 rounded-xl  flex flex-col  shadow-lg">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {showModeToggle && (
          <div className="flex items-center gap-2">
            {(["single", "multi"] as const).map((opt) => (
              <label
                key={opt}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium cursor-pointer transition ${
                  mode === opt
                    ? "border-emerald-400/70 bg-emerald-400/15 text-white"
                    : "border-white/15 bg-white/5 text-white/70 hover:border-white/25"
                }`}
              >
                <input
                  type="radio"
                  name="swap-mode"
                  value={opt}
                  checked={mode === opt}
                  onChange={() => setMode(opt)}
                  className="hidden"
                />
                {opt === "single" ? "TWAP" : "Multi-hop"}
              </label>
            ))}
          </div>
        )}
        {showSlippageControl && (
          <div className="flex items-center gap-3">
            <div className="relative" ref={spreadMenuRef}>
              <button
                type="button"
                onClick={() => setSpreadMenuOpen((v) => !v)}
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-black/50 px-3 py-1.5 text-sm text-white hover:bg-black/70"
              >
                <span className="text-white/70">Slippage</span>
                <span className="rounded-lg bg-emerald-500/15 px-2 py-0.5 text-emerald-300 tabular-nums">
                  {effectiveSpreadPercent}%
                </span>
                <svg
                  viewBox="0 0 20 20"
                  className="h-4 w-4 opacity-70"
                  fill="currentColor"
                >
                  <path d="M6 8l4 4 4-4H6z" />
                </svg>
              </button>
              {spreadMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 rounded-xl border border-white/10 bg-[#0b0b0b]/95 p-4 shadow-2xl backdrop-blur z-50">
                  <div className="mb-2 text-xs text-white/70">
                    Select a preset
                  </div>
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {[0.5, 1, 2, 5].map((p) => (
                      <button
                        key={p}
                        onClick={() => handleSelectPresetSpread(p)}
                        className={`rounded-lg border px-3 py-2 text-sm ${
                          Number(effectiveSpreadPercent) === p
                            ? "border-emerald-400 bg-emerald-400/15 text-emerald-300"
                            : "border-white/10 bg-white/5 text-white hover:border-white/20"
                        }`}
                      >
                        {p}%
                      </button>
                    ))}
                  </div>
                  {!onSlippageChange && (
                    <>
                      <div className="flex items-center justify-between text-xs text-white/70">
                        <span>Custom</span>
                        <span>{customSpreadPercent.toFixed(2)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={50}
                        step={0.1}
                        value={customSpreadPercent}
                        onChange={(e) =>
                          setCustomSpreadPercent(Number(e.target.value))
                        }
                        className="w-full mt-2 accent-emerald-400"
                      />
                      <button
                        onClick={handleApplyCustomSpread}
                        className="mt-3 w-full rounded-lg bg-emerald-500/20 px-3 py-2 text-sm text-emerald-200 border border-emerald-400/40 hover:bg-emerald-500/30"
                      >
                        Apply
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            {showInlineConnect && (
              <button
                type="button"
                onClick={handleWalletClick}
                className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-white hover:border-emerald-400/60"
              >
                {walletLabel}
              </button>
            )}
          </div>
        )}
      </header>


      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="rounded-xl border border-neutral-800 bg-black/40 p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-neutral-300">Pay:</span>
            <span className="text-neutral-400">
              {routeLoading
                ? "Fetching route…"
                : offerMeta?.symbol || offerDenom || "Select token"}
            </span>
          </div>
          <div className="bg-black/30 border border-neutral-800 rounded-xl p-3 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <input
                value={totalAmountValue}
                onChange={(event) =>
                  mode === "single"
                    ? handleSingleChange("totalAmount", event.target.value)
                    : handleMultiChange("totalAmount", event.target.value)
                }
                inputMode="decimal"
                placeholder="0.00"
                className="bg-transparent text-lg focus:outline-none w-full text-white flex-1"
                required
              />
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setOfferSelectOpen((open) => !open)}
                  className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-black/60 px-3 py-2 text-sm text-white hover:border-neutral-600"
                >
                  {offerMeta?.imageUri && (
                    <img
                      src={offerMeta.imageUri}
                      alt={offerMeta.symbol}
                      className="w-[18px] h-[18px] rounded-full"
                    />
                  )}
                  <span>{offerMeta?.symbol || "Select"}</span>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M4 6L8 10L12 6"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                {offerSelectOpen && (
                  <div className="absolute top-full right-0 left-0 mt-2 bg-black/40 border border-neutral-800 rounded-xl z-50 max-h-80 overflow-y-auto shadow-2xl">
                    <div className="p-3">
                      <input
                        type="text"
                        placeholder="Search token..."
                        value={offerSearch}
                        onChange={(e) => setOfferSearch(e.target.value)}
                        className="w-full px-3 py-2 bg-black/60 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-400/60"
                      />
                    </div>
                    <div className="space-y-1 p-2">
                      {filteredOfferTokens.map((token) => (
                        <button
                          key={token.denom}
                          type="button"
                          onClick={() => handleSelectOfferToken(token.denom)}
                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                            trimmedOfferDenom === token.denom
                              ? "bg-emerald-500/20 text-emerald-200"
                              : "text-white/70 hover:bg-white/5"
                          }`}
                        >
                          {token.imageUri && (
                            <img
                              src={token.imageUri}
                              alt={token.symbol}
                              className="w-5 h-5 rounded-full"
                            />
                          )}
                          <div className="flex-1 text-left">
                            <div className="font-medium">{token.symbol}</div>
                            <div className="text-xs text-white/50">
                              {token.denom}
                            </div>
                          </div>
                          {trimmedOfferDenom === token.denom && (
                            <span className="text-xs">✓</span>
                          )}
                        </button>
                      ))}
                      {filteredOfferTokens.length === 0 && (
                        <div className="text-xs text-white/50 px-3 py-2">
                          No tokens found.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleMaxClick}
                disabled={!offerBalance || offerBalance <= 0}
                className="text-xs bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed text-emerald-300 px-2 py-1 rounded border border-emerald-400/30 transition-colors"
              >
                MAX
              </button>
            </div>
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span>
                Balance:{" "}
                {fmt(offerBalance, Math.min(6, getTokenDecimals(offerMeta)))}
              </span>
              <span className="text-white/60">
                {offerMeta?.symbol || offerDenom || ""}
              </span>
            </div>
          </div>
        </div>


        <div className="flex justify-center">
          <button
            type="button"
            onClick={handleFlipDenoms}
            className="bg-black/50 p-2 rounded-full border border-white/30 hover:bg-black/70 transition"
            title="Flip offer/ask"
          >
            <ArrowUpDown size={16} className="text-white" />
          </button>
        </div>


        <div className="rounded-xl border border-neutral-800 bg-black/40 p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-neutral-300">Receive:</span>
            <span className="text-neutral-400">
              {askMeta?.symbol || askDenom || "Waiting for route"}
            </span>
          </div>
          <div className="bg-black/30 border border-neutral-800 rounded-xl p-3 flex items-center justify-between gap-3">
            <div>
              <input
                readOnly
                value={receiveEstimate}
                placeholder="0.00"
                className="bg-transparent text-lg focus:outline-none w-full text-white/70"
              />
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setAskSelectOpen((open) => !open)}
                className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-black/60 px-3 py-1 text-sm text-white hover:border-neutral-600"
              >
                {askMeta?.imageUri && (
                  <img
                    src={askMeta.imageUri}
                    alt={askMeta.symbol}
                    className="w-[18px] h-[18px] rounded-full"
                  />
                )}
                <span>{askMeta?.symbol || askDenom || "Select"}</span>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M4 6L8 10L12 6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              {askSelectOpen && (
                <div className="absolute top-full right-0 left-0 mt-2 bg-black/40 border border-neutral-800 rounded-xl z-50 max-h-80 overflow-y-auto shadow-2xl">
                  <div className="p-3">
                    <input
                      type="text"
                      placeholder="Search token..."
                      value={askSearch}
                      onChange={(e) => setAskSearch(e.target.value)}
                      className="w-full px-3 py-2 bg-black/60 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-400/60"
                    />
                  </div>
                  <div className="space-y-1 p-2">
                    {filteredAskTokens.map((token) => (
                      <button
                        key={token.denom}
                        type="button"
                        onClick={() => handleSelectAskToken(token.denom)}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                          trimmedAskDenom === token.denom
                            ? "bg-emerald-500/20 text-emerald-200"
                            : "text-white/70 hover:bg-white/5"
                        }`}
                      >
                        {token.imageUri && (
                          <img
                            src={token.imageUri}
                            alt={token.symbol}
                            className="w-5 h-5 rounded-full"
                          />
                        )}
                        <div className="flex-1 text-left">
                          <div className="font-medium">{token.symbol}</div>
                          <div className="text-xs text-white/50">
                            {token.denom}
                          </div>
                        </div>
                        {trimmedAskDenom === token.denom && (
                          <span className="text-xs">✓</span>
                        )}
                      </button>
                    ))}
                    {filteredAskTokens.length === 0 && (
                      <div className="text-xs text-white/50 px-3 py-2">
                        No tokens found.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          {/* {pairAddress && (
            <div className="text-xs text-neutral-500">
              Pair: <span className="font-mono text-white/80">{pairAddress}</span>
            </div>
          )} */}
          {mode === "multi" && routeLabel && (
            <div className="text-xs text-white/60">Route: {routeLabel}</div>
          )}
          {routeLoading && (
            <div className="text-xs text-white/60">Fetching route…</div>
          )}
        </div>


        <div className="rounded-xl border border-neutral-800 bg-black/40 p-4 space-y-4">
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/60 border-b border-white/10 pb-2">
            <span>Schedule & Safeguards</span>
            <span className="text-[11px] text-emerald-300">
              Slippage: {effectiveSpreadPercent}%
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm text-white/80">
              Chunk Count
              <input
                value={
                  mode === "single"
                    ? singleForm.chunkCount
                    : multiForm.chunkCount
                }
                onChange={(event) =>
                  mode === "single"
                    ? handleSingleChange("chunkCount", event.target.value)
                    : handleMultiChange("chunkCount", event.target.value)
                }
                placeholder="4"
                className="rounded-lg border border-neutral-800 bg-black/60 px-3 py-2 text-sm text-white placeholder-white/40 outline-none focus:border-emerald-400/60"
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-white/80">
              Total Duration
              <input
                value={
                  mode === "single"
                    ? singleForm.totalMinutes
                    : multiForm.totalMinutes
                }
                onChange={(event) =>
                  mode === "single"
                    ? handleSingleChange("totalMinutes", event.target.value)
                    : handleMultiChange("totalMinutes", event.target.value)
                }
                placeholder="60"
                className="rounded-lg border border-neutral-800 bg-black/60 px-3 py-2 text-sm text-white placeholder-white/40 outline-none focus:border-emerald-400/60"
                required
              />
            </label>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-white/60">
            <span>
              Use the slippage control above to cap per-chunk execution.
            </span>
            {showSlippageControl && (
              <button
                type="button"
                onClick={() => setSpreadMenuOpen(true)}
                className="inline-flex items-center gap-2 rounded-full border border-emerald-400/50 bg-emerald-400/10 px-3 py-1.5 text-sm text-emerald-200 hover:bg-emerald-400/20"
              >
                Adjust Slippage ({effectiveSpreadPercent}%)
              </button>
            )}
          </div>
        </div>


        <div className="flex flex-col gap-2">
          {shouldShowCancel ? (
            <button
              type="button"
              className="w-full rounded-lg bg-gradient-to-r from-rose-500 to-rose-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 disabled:opacity-50"
              onClick={handleCancelOrder}
              disabled={canceling || activeOrderLoading}
            >
              {canceling ? "Cancelling…" : "Cancel Order"}
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canSubmit || isSubmitting || queryClientLoading}
              className="w-full rounded-lg bg-gradient-to-r from-[#39C8A6] to-[#2fb896] px-4 py-3 text-sm font-semibold text-black shadow-lg shadow-emerald-500/30 disabled:opacity-50"
            >
              {isSubmitting ? "Submitting…" : "Submit Order"}
            </button>
          )}


          {(inactiveStatusMessage || queryClientLoading) && (
            <div className="text-xs text-white/70">
              {inactiveStatusMessage ||
                (queryClientLoading && "Initialising contract client…")}
            </div>
          )}


          {submitState.status === "pending" && submitState.message && (
            <span className="swap-status">{submitState.message}</span>
          )}
          {submitState.status === "error" && submitState.message && (
            <span className="swap-error">{submitState.message}</span>
          )}
          {chunkNotice && <span className="swap-success">{chunkNotice}</span>}
          {chunkError && <span className="swap-error">{chunkError}</span>}
          {submitState.status === "success" && submitState.message && (
            <span className="swap-success">
              {submitState.message}
              {submitState.txHash && (
                <>
                  {" "}
                  <a
                    href={`${EXPLORER_BASE_URL}${submitState.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View tx
                  </a>
                </>
              )}
            </span>
          )}
          {cancelMessage && (
            <span className="swap-status">{cancelMessage}</span>
          )}
          {!isConnected && (
            <p className="text-xs text-rose-300/80">
              Connect Keplr to submit an order.
            </p>
          )}
        </div>
      </form>
      {notification && (
        <div
          aria-live="assertive"
          className={`pointer-events-auto absolute right-4 bottom-4 z-40 w-full max-w-xs rounded-2xl border px-4 py-3 text-sm shadow-xl transition duration-300 ${
            notification.type === "error"
              ? "bg-gradient-to-r from-rose-700 via-rose-600 to-rose-500 text-white border-rose-500/60"
              : "bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-400 text-white border-emerald-400/60"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">
              {notification.type === "error" ? "Chunk failed" : "Success"}
            </span>
            <button
              type="button"
              onClick={() => setNotification(null)}
              className="text-xs font-semibold uppercase tracking-wide text-white/80 hover:text-white"
            >
              Dismiss
            </button>
          </div>
          <p className="mt-1 text-xs leading-snug text-white/90">
            {notification.message}
          </p>
        </div>
      )}
    </section>
  );
}
