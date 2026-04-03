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
import { WalletStatus } from "@cosmos-kit/core";
import { Search, ArrowUpDown } from "lucide-react";
import { useWallet } from "@/lib/twap/useWallet";
import { useLimitOrderClients } from "@/lib/limitorder/useLimitOrderClients";
import type {
  EnhancedOrder,
  OrderStatus,
  OrderStatusInfo,
} from "@/lib/limitorder/types";
import { DEFAULT_BALANCE_DENOM } from "@/lib/twap/constants";
import {
  getTokenDecimals,
  toRawAmount,
  isValidDisplayAmount,
} from "@/lib/twap/tokenAmount";
import { API_BASE_URL, API_HEADERS } from "@/lib/api";

const EXPLORER_BASE_URL = "https://zigscan.org/tx/";
const GAS_PRICE = 0.0025;
const CREATE_GAS_LIMIT = 350000;
const CANCEL_GAS_LIMIT = 260000;
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
        amount: Math.ceil(gasLimit * GAS_PRICE).toString(),
      },
    ],
  };
}

type SubmitState = {
  status: "idle" | "pending" | "success" | "error";
  message: string | null;
  txHash?: string | null;
};

type TokenListItem = {
  denom: string;
  symbol: string;
  exponent: number;
  imageUri?: string;
};

type SwapFormCache = {
  poolAddress: string;
  offerDenom: string;
  askDenom: string;
  side: "buy" | "sell";
  quantity: string;
  limitPrice: string;
};

type SwapFormProps = {
  showInlineConnect?: boolean;
  cachedForm?: SwapFormCache;
  onFormChange?: (form: SwapFormCache) => void;
  onClear?: () => void;
  defaultOfferDenom?: string;
  defaultAskDenom?: string;
  defaultPairAddress?: string;
  slippagePercent?: number;
  onSlippageChange?: (percent: number) => void;
};

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pending",
  open: "Open",
  filled: "Filled",
  partial: "Partial Fill",
  cancelled: "Cancelled",
  failed: "Failed",
  expired: "Expired",
};

const ORDER_STATUS_BADGES: Record<OrderStatus, string> = {
  pending: "text-yellow-300 border-yellow-400/40 bg-yellow-500/10",
  open: "text-emerald-200 border-emerald-400/40 bg-emerald-500/10",
  filled: "text-sky-200 border-sky-400/40 bg-sky-500/10",
  partial: "text-amber-200 border-amber-400/40 bg-amber-500/10",
  cancelled: "text-orange-200 border-orange-400/40 bg-orange-500/10",
  failed: "text-red-300 border-red-400/40 bg-red-500/10",
  expired: "text-neutral-200 border-neutral-400/40 bg-neutral-500/10",
};

const DEFAULT_ORDER_STATUS_BADGE =
  "text-white/70 border border-white/15 bg-white/5";

function formatOrderStatusLabel(status?: string) {
  if (!status) {
    return "Unknown";
  }
  if (status in ORDER_STATUS_LABELS) {
    return ORDER_STATUS_LABELS[status as OrderStatus];
  }
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getOrderStatusBadgeClass(status?: string) {
  if (!status) {
    return DEFAULT_ORDER_STATUS_BADGE;
  }
  if (status in ORDER_STATUS_BADGES) {
    return ORDER_STATUS_BADGES[status as OrderStatus];
  }
  return DEFAULT_ORDER_STATUS_BADGE;
}

const SUBMIT_STATUS_META: Record<
  SubmitState["status"],
  { label: string; badgeClass: string; boxClass: string }
> = {
  idle: {
    label: "Idle",
    badgeClass: "text-white/70 border-white/30 bg-white/10",
    boxClass: "border-white/10 bg-white/5 text-white/70",
  },
  pending: {
    label: "Pending",
    badgeClass: "text-yellow-300 border-yellow-400/40 bg-yellow-500/20",
    boxClass: "border-yellow-400/30 bg-yellow-500/10 text-yellow-200",
  },
  success: {
    label: "Success",
    badgeClass: "text-emerald-300 border-emerald-400/40 bg-emerald-500/20",
    boxClass: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
  },
  error: {
    label: "Failed",
    badgeClass: "text-red-300 border-red-400/40 bg-red-500/20",
    boxClass: "border-red-400/30 bg-red-500/10 text-red-200",
  },
};

export function SwapForm({
  showInlineConnect = true,
  cachedForm,
  onFormChange,
  onClear,
  defaultOfferDenom,
  defaultAskDenom,
  defaultPairAddress,
  slippagePercent,
  onSlippageChange,
}: SwapFormProps) {
  const wallet = useWallet();
  const {
    queryClient,
    getExecuteClient,
    queryClientLoading,
    signingClient,
    queryClientError,
  } = useLimitOrderClients();

  const [submitState, setSubmitState] = useState<SubmitState>({
    status: "idle",
    message: null,
    txHash: null,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeOrders, setActiveOrders] = useState<EnhancedOrder[]>([]);
  const [activeOrdersLoading, setActiveOrdersLoading] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [cancelMessage, setCancelMessage] = useState<string | null>(null);
  const [cancelOrderId, setCancelOrderId] = useState<number | null>(null);

  const [form, setForm] = useState<SwapFormCache>(() => {
    if (cachedForm && Object.keys(cachedForm).length > 0) {
      return {
        poolAddress: cachedForm.poolAddress || "",
        offerDenom: cachedForm.offerDenom || "",
        askDenom: cachedForm.askDenom || "",
        side: cachedForm.side || "buy",
        quantity: cachedForm.quantity || "",
        limitPrice: cachedForm.limitPrice || "",
      };
    }
    return {
      poolAddress: "",
      offerDenom: "",
      askDenom: "",
      side: "buy",
      quantity: "",
      limitPrice: "",
    };
  });

  // Token list and balance management
  const [tokenList, setTokenList] = useState<TokenListItem[]>([
    { denom: "uzig", symbol: "ZIG", exponent: 6 },
  ]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [bankClient, setBankClient] = useState<any>(null);
  const [offerSelectOpen, setOfferSelectOpen] = useState(false);
  const [askSelectOpen, setAskSelectOpen] = useState(false);
  const [offerSearch, setOfferSearch] = useState("");
  const [askSearch, setAskSearch] = useState("");
  const [receiveAmount, setReceiveAmount] = useState<string>("");

  // Use a ref to track the last cached form to prevent circular updates
  const lastCachedFormRef = useRef<SwapFormCache | undefined>(cachedForm);

  // Sync with cached form when it changes (only if cache exists and is different)
  useEffect(() => {
    if (cachedForm && Object.keys(cachedForm).length > 0) {
      const isDifferent =
        !lastCachedFormRef.current ||
        cachedForm.poolAddress !== lastCachedFormRef.current.poolAddress ||
        cachedForm.offerDenom !== lastCachedFormRef.current.offerDenom ||
        cachedForm.askDenom !== lastCachedFormRef.current.askDenom ||
        cachedForm.side !== lastCachedFormRef.current.side ||
        cachedForm.quantity !== lastCachedFormRef.current.quantity ||
        cachedForm.limitPrice !== lastCachedFormRef.current.limitPrice;

      if (isDifferent) {
        lastCachedFormRef.current = cachedForm;
        setForm(cachedForm);
      }
    }
  }, [cachedForm]);

  // Update cache when form changes (after render completes)
  // Only update if form is different from the last cached form
  useEffect(() => {
    if (onFormChange && lastCachedFormRef.current) {
      const formChanged =
        form.poolAddress !== lastCachedFormRef.current.poolAddress ||
        form.offerDenom !== lastCachedFormRef.current.offerDenom ||
        form.askDenom !== lastCachedFormRef.current.askDenom ||
        form.side !== lastCachedFormRef.current.side ||
        form.quantity !== lastCachedFormRef.current.quantity ||
        form.limitPrice !== lastCachedFormRef.current.limitPrice;

      if (formChanged) {
        lastCachedFormRef.current = form;
        onFormChange(form);
      }
    } else if (onFormChange && !lastCachedFormRef.current) {
      // First time, update cache
      lastCachedFormRef.current = form;
      onFormChange(form);
    }
  }, [form, onFormChange]);

  // Load token list from API
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
        console.warn("[limit-order swap-list] failed", e);
      }
    })();
  }, []);

  // Initialize bank client
  useEffect(() => {
    if (bankClient) return;
    (async () => {
      try {
        const { CosmWasmClient } = await import("@cosmjs/cosmwasm-stargate");
        const client = await CosmWasmClient.connect(RPC_URL);
        setBankClient(client);
      } catch (e) {
        console.warn("[limit-order bank client] failed", e);
      }
    })();
  }, [bankClient]);

  // Load balance for a specific denom
  const loadBalanceFor = useCallback(
    async (denom: string) => {
      if (!wallet.address || !bankClient || !denom || !denom.trim()) return;
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
        console.warn("[limit-order balance] failed", e);
      }
    },
    [bankClient, tokenList, wallet.address]
  );

  // Auto-load offer denom balance when it changes
  useEffect(() => {
    if (form.offerDenom && wallet.address) {
      loadBalanceFor(form.offerDenom);
    }
  }, [form.offerDenom, wallet.address, loadBalanceFor]);

  // Auto-load ask denom balance when it changes
  useEffect(() => {
    if (form.askDenom && wallet.address) {
      loadBalanceFor(form.askDenom);
    }
  }, [form.askDenom, wallet.address, loadBalanceFor]);

  // Sync default denoms from parent when they change
  useEffect(() => {
    if (defaultOfferDenom && form.offerDenom !== defaultOfferDenom) {
      setForm((prev) => ({
        ...prev,
        offerDenom: defaultOfferDenom,
      }));
    }
  }, [defaultOfferDenom]);

  useEffect(() => {
    if (defaultAskDenom && form.askDenom !== defaultAskDenom) {
      setForm((prev) => ({
        ...prev,
        askDenom: defaultAskDenom,
      }));
    }
  }, [defaultAskDenom]);

  useEffect(() => {
    if (defaultPairAddress && form.poolAddress !== defaultPairAddress) {
      setForm((prev) => ({
        ...prev,
        poolAddress: defaultPairAddress,
      }));
    }
  }, [defaultPairAddress]);

  // Sync slippage from parent
  useEffect(() => {
    if (
      slippagePercent !== undefined &&
      slippagePercent !== currentSpreadPercent
    ) {
      setCurrentSpreadPercent(slippagePercent);
      setIsCustomSpread(false);
    }
  }, [slippagePercent]);

  // Calculate receive amount based on quantity (simulating current market price)
  useEffect(() => {
    let cancelled = false;

    const calculateReceiveAmount = async () => {
      if (!form.quantity || !form.offerDenom || !form.askDenom || !bankClient) {
        setReceiveAmount("");
        return;
      }

      try {
        const qty = parseFloat(form.quantity);
        if (qty <= 0 || !Number.isFinite(qty)) {
          setReceiveAmount("");
          return;
        }

        // Get token decimals
        const offerMeta = tokenList.find((t) => t.denom === form.offerDenom);
        const askMeta = tokenList.find((t) => t.denom === form.askDenom);
        if (!offerMeta || !askMeta) {
          setReceiveAmount("");
          return;
        }

        const offerDecimals = getTokenDecimals(offerMeta);
        const askDecimals = getTokenDecimals(askMeta);

        // Convert to micro amount
        const amountInMicro =
          offerDecimals === 0
            ? Math.round(qty).toString()
            : Math.round(qty * Math.pow(10, offerDecimals)).toString();

        // Simulate the swap using the pool address
        const poolAddress = form.poolAddress?.trim();
        if (!poolAddress) {
          setReceiveAmount("");
          return;
        }

        const offer_asset = form.offerDenom.startsWith("zig1")
          ? {
              amount: amountInMicro,
              info: { token: { contract_addr: form.offerDenom } },
            }
          : {
              amount: amountInMicro,
              info: { native_token: { denom: form.offerDenom } },
            };

        const sim: any = await bankClient.queryContractSmart(poolAddress, {
          simulation: { offer_asset },
        });

        if (!cancelled && sim?.return_amount) {
          const returnMicro = Number(sim.return_amount);
          const receiveAmt =
            askDecimals === 0
              ? returnMicro
              : returnMicro / Math.pow(10, askDecimals);

          setReceiveAmount(receiveAmt.toFixed(6));
        } else {
          setReceiveAmount("");
        }
      } catch (e) {
        console.warn("[limit-order receive calc] failed", e);
        setReceiveAmount("");
      }
    };

    calculateReceiveAmount();
    return () => {
      cancelled = true;
    };
  }, [
    form.quantity,
    form.offerDenom,
    form.askDenom,
    form.poolAddress,
    bankClient,
    tokenList,
  ]);

  const isConnected = wallet.isConnected && Boolean(wallet.address);
  const submitStatusMeta = SUBMIT_STATUS_META[submitState.status];
  const submitStatusMessage =
    submitState.status === "error" && submitState.message
      ? `Order failed due to ${submitState.message}`
      : submitState.message;

  // Get token metadata
  const offerMeta = tokenList.find((t) => t.denom === form.offerDenom);
  const askMeta = tokenList.find((t) => t.denom === form.askDenom);
  const offerBalance = balances[form.offerDenom] ?? 0;

  // Filter tokens based on search (exclude the other selected token)
  const filteredOfferTokens = useMemo(() => {
    const lower = offerSearch.toLowerCase();
    return tokenList.filter(
      (t) =>
        (t.symbol.toLowerCase().includes(lower) ||
          t.denom.toLowerCase().includes(lower)) &&
        t.denom !== form.askDenom // Exclude already selected ask token
    );
  }, [offerSearch, tokenList, form.askDenom]);

  const filteredAskTokens = useMemo(() => {
    const lower = askSearch.toLowerCase();
    return tokenList.filter(
      (t) =>
        (t.symbol.toLowerCase().includes(lower) ||
          t.denom.toLowerCase().includes(lower)) &&
        t.denom !== form.offerDenom // Exclude already selected offer token
    );
  }, [askSearch, tokenList, form.offerDenom]);

  const sortedTokens = useMemo(
    () => tokenList.slice().sort((a, b) => a.symbol.localeCompare(b.symbol)),
    [tokenList]
  );

  const spreadMenuRef = useRef<HTMLDivElement | null>(null);
  const [spreadMenuOpen, setSpreadMenuOpen] = useState(false);
  const [currentSpreadPercent, setCurrentSpreadPercent] = useState<number>(0.5);
  const [customSpreadPercent, setCustomSpreadPercent] = useState<number>(0.5);
  const [isCustomSpread, setIsCustomSpread] = useState(false);

  const sideMenuRef = useRef<HTMLDivElement | null>(null);
  const [sideMenuOpen, setSideMenuOpen] = useState(false);

  const displaySpreadPercent = useMemo(() => {
    const value = isCustomSpread ? customSpreadPercent : currentSpreadPercent;
    return Number.isFinite(value) ? value : 0;
  }, [customSpreadPercent, currentSpreadPercent, isCustomSpread]);

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

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!sideMenuRef.current) return;
      if (!sideMenuRef.current.contains(event.target as Node)) {
        setSideMenuOpen(false);
      }
    }

    if (sideMenuOpen) {
      document.addEventListener("mousedown", handleClick);
    }

    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [sideMenuOpen]);

  const formatSpreadLabel = useCallback((percent: number) => {
    if (percent >= 1) {
      return `${percent.toFixed(0)}%`;
    }
    return `${percent.toFixed(1)}%`;
  }, []);

  const handleSelectPresetSpread = useCallback((percent: number) => {
    setCurrentSpreadPercent(percent);
    setIsCustomSpread(false);
    setSpreadMenuOpen(false);
  }, []);

  const handleApplyCustomSpread = useCallback(() => {
    const clamped = Math.min(Math.max(customSpreadPercent, 0), 50);
    setCustomSpreadPercent(clamped);
    setCurrentSpreadPercent(clamped);
    setIsCustomSpread(true);
    setSpreadMenuOpen(false);
    onSlippageChange?.(clamped);
  }, [customSpreadPercent, onSlippageChange]);

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
    if (!isConnected) {
      return false;
    }
    const offerDenom = (form.offerDenom || "").trim();
    const askDenom = (form.askDenom || "").trim();
    const poolAddress = (form.poolAddress || "").trim();
    const quantity = (form.quantity || "").trim();
    const limitPrice = (form.limitPrice || "").trim();

    // All fields are required for single-hop orders
    if (!offerDenom || !askDenom || !poolAddress || !quantity || !limitPrice) {
      return false;
    }

    return true;
  }, [isConnected, form]);

  const handleChange = (
    field: keyof SwapFormCache,
    value: string | "buy" | "sell"
  ) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleFlipDenoms = () => {
    setForm((prev) => ({
      ...prev,
      offerDenom: prev.askDenom,
      askDenom: prev.offerDenom,
    }));
  };

  const handleSelectOfferToken = (denom: string) => {
    setForm((prev) => ({
      ...prev,
      offerDenom: denom,
    }));
    setOfferSelectOpen(false);
    setOfferSearch("");
  };

  const handleSelectAskToken = (denom: string) => {
    setForm((prev) => ({
      ...prev,
      askDenom: denom,
    }));
    setAskSelectOpen(false);
    setAskSearch("");
  };

  const handleClear = () => {
    const cleared: SwapFormCache = {
      poolAddress: "",
      offerDenom: "",
      askDenom: "",
      side: "buy" as const,
      quantity: "",
      limitPrice: "",
    };
    setForm(cleared);
    if (onFormChange) {
      onFormChange(cleared);
    }
    if (onClear) {
      onClear();
    }
    setSubmitState({ status: "idle", message: null, txHash: null });
  };

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

    // It's possible the dedicated query client hasn't been created yet
    // Attempt to proceed by creating an execute client (which also exposes query methods)
    // and only fail if that cannot be created.

    try {
      setIsSubmitting(true);
      setSubmitState({
        status: "pending",
        message: "Submitting order…",
        txHash: null,
      });

      let configResponse: any = null;

      // Try to obtain execute client with a short retry loop in case wallet signing client
      // is still initializing. This reduces spurious "client not ready" failures.
      const attemptGetExecuteClient = async (retries = 6, delayMs = 500) => {
        let lastErr: any = null;
        for (let i = 0; i < retries; i++) {
          try {
            const c = await getExecuteClient();
            return c;
          } catch (err) {
            lastErr = err;
            // small delay before retrying
            // eslint-disable-next-line no-await-in-loop
            await new Promise((res) => setTimeout(res, delayMs));
          }
        }
        throw lastErr;
      };

      let executeClient: any = null;
      try {
        executeClient = await attemptGetExecuteClient();
      } catch (e) {
        setSubmitState({
          status: "error",
          message: "Contract client not ready. Please try again in a moment.",
          txHash: null,
        });
        return;
      }

      // Prefer the standalone query client if available, otherwise use executeClient for queries
      try {
        configResponse = queryClient
          ? await queryClient.config()
          : await executeClient.config();
      } catch (e) {
        // If config fails, surface error to user
        setSubmitState({
          status: "error",
          message: "Failed to read contract config. Please try again.",
          txHash: null,
        });
        return;
      }
      const config = configResponse as { gas_fee_per_order?: string };

      const offerDenom = (form.offerDenom || "").trim();
      const askDenom = (form.askDenom || "").trim();
      const poolAddress = (form.poolAddress || "").trim();
      const quantityDisplay = (form.quantity || "").trim();
      const limitPriceDisplay = (form.limitPrice || "").trim();
      const side = form.side as "buy" | "sell";

      // Validate required fields
      if (
        !offerDenom ||
        !askDenom ||
        !poolAddress ||
        !quantityDisplay ||
        !limitPriceDisplay
      ) {
        throw new Error("All required fields must be filled in.");
      }

      // Validate display amounts (must be valid numbers)
      if (!isValidDisplayAmount(quantityDisplay)) {
        throw new Error(
          "Quantity must be a valid positive number (e.g., 1.5 or 0.001)."
        );
      }

      if (!isValidDisplayAmount(limitPriceDisplay)) {
        throw new Error("Limit price must be a valid positive number.");
      }

      // Convert display amounts to raw amounts using the token's decimals
      const submitOfferMeta = tokenList.find((t) => t.denom === offerDenom);
      const quantity = toRawAmount(
        quantityDisplay,
        getTokenDecimals(submitOfferMeta)
      );
      const limitPrice = limitPriceDisplay; // Price stays as-is (it's already a ratio)

      const gasFeePerOrder = BigInt(config.gas_fee_per_order ?? "100000");
      const totalGasFee = gasFeePerOrder.toString();

      const funds: Coin[] = [];
      if (offerDenom === DEFAULT_BALANCE_DENOM) {
        const combined = (BigInt(quantity) + BigInt(totalGasFee)).toString();
        funds.push({ denom: DEFAULT_BALANCE_DENOM, amount: combined });
      } else {
        funds.push({ denom: offerDenom, amount: quantity });
        funds.push({ denom: DEFAULT_BALANCE_DENOM, amount: totalGasFee });
      }

      const selectedPercent = displaySpreadPercent;
      const maxSpreadInput = (selectedPercent / 100)
        .toFixed(4)
        .replace(/0+$/u, "")
        .replace(/\.$/u, "");

      const fee = buildStdFee(CREATE_GAS_LIMIT);

      const response = (await executeClient.createLimitOrder(
        {
          poolAddress,
          side,
          offerDenom,
          askDenom,
          quantity,
          limitPrice,
          minReceive: null,
          maxSpread: maxSpreadInput.length > 0 ? maxSpreadInput : null,
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

      await refreshActiveOrders();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to submit order.";
      setSubmitState({ status: "error", message, txHash: null });
    } finally {
      setIsSubmitting(false);
    }
  };

  const refreshActiveOrders = useCallback(async () => {
    if (!queryClient || !wallet.address) {
      setActiveOrders([]);
      return;
    }

    setActiveOrdersLoading(true);
    try {
      const result = await queryClient.userActiveOrders(wallet.address);
      const orders = (result as { orders?: EnhancedOrder[] })?.orders ?? [];
      setActiveOrders(Array.isArray(orders) ? orders : []);
    } catch (error) {
      console.warn("Failed to load active orders", error);
      setActiveOrders([]);
    } finally {
      setActiveOrdersLoading(false);
    }
  }, [queryClient, wallet.address]);

  useEffect(() => {
    refreshActiveOrders();
  }, [refreshActiveOrders, signingClient]);

  useEffect(() => {
    if (!wallet.address) return undefined;

    const interval = setInterval(() => {
      refreshActiveOrders();
    }, 8_000);

    return () => {
      clearInterval(interval);
    };
  }, [refreshActiveOrders, wallet.address]);

  const handleCancelOrder = useCallback(
    async (orderId: number) => {
      if (!wallet.address) {
        setCancelMessage("Connect your wallet to cancel the order.");
        return;
      }
      try {
        setCanceling(true);
        setCancelMessage(null);
        setCancelOrderId(orderId);
        const executeClient = await getExecuteClient();
        const fee = buildStdFee(CANCEL_GAS_LIMIT);
        await executeClient.cancelOrder(orderId, fee);
        setCancelMessage(
          "Cancellation submitted. Await confirmation on-chain."
        );
        await refreshActiveOrders();
      } catch (error) {
        setCancelMessage(
          error instanceof Error ? error.message : "Failed to cancel order."
        );
      } finally {
        setCanceling(false);
        setCancelOrderId(null);
      }
    },
    [getExecuteClient, wallet.address, refreshActiveOrders]
  );

  return (
    <>
      <header className="flex items-center justify-between mb-4">
        <div />
        {/* <div className="flex items-center gap-2">
          {showInlineConnect && (
            <button
              type="button"
              onClick={handleWalletClick}
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-white hover:border-emerald-400/60"
            >
              {walletLabel}
            </button>
          )}
          <button
            type="button"
            onClick={handleClear}
            className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-white hover:border-emerald-400/60"
            title="Clear form"
          >
            Clear
          </button>
        </div> */}
      </header>

      <form className="space-y-4" onSubmit={handleSubmit}>
        {/* Pay / Offer Token Section */}
        <div className="rounded-xl border border-neutral-800 bg-black/40 p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-neutral-300">Pay:</span>
            <span className="text-neutral-400">
              {offerMeta?.symbol || "Select token"}
            </span>
          </div>
          <div className="bg-black/30 border border-neutral-800 rounded-xl p-3 flex items-center gap-3 relative">
            <input
              value={form.quantity}
              onChange={(event) => handleChange("quantity", event.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="bg-transparent text-lg focus:outline-none w-full text-white flex-1"
              required
            />
            {/* Offer Token Dropdown */}
            <button
              type="button"
              onClick={() => setOfferSelectOpen(!offerSelectOpen)}
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-black/60 px-3 py-2 text-sm text-white hover:border-neutral-600"
            >
              {offerMeta?.imageUri && (
                <img
                  src={offerMeta.imageUri}
                  alt={offerMeta.symbol}
                  style={{ width: "16px", height: "16px", borderRadius: "50%" }}
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
              <div className="absolute top-full right-0 left-0 mt-2 bg-black/40 border border-neutral-800 rounded-xl z-50 max-h-80 overflow-y-auto shadow-lg">
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
                        form.offerDenom === token.denom
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
                      {form.offerDenom === token.denom && (
                        <span className="text-xs">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span>Balance: {offerBalance.toFixed(6)}</span>
            <span>{offerMeta?.symbol || ""}</span>
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

        {/* Receive / Ask Token Section */}
        <div className="rounded-xl border border-neutral-800 bg-black/40 p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-neutral-300">Receive:</span>
            <span className="text-neutral-400">
              {askMeta?.symbol || "Select token"}
            </span>
          </div>
          <div className="bg-black/30 border border-neutral-800 rounded-xl p-3 flex items-center gap-3 relative">
            <input
              readOnly
              value={receiveAmount}
              placeholder="0.00"
              className="bg-transparent text-lg focus:outline-none w-full text-white/70 flex-1"
            />
            {/* Ask Token Dropdown */}
            <button
              type="button"
              onClick={() => setAskSelectOpen(!askSelectOpen)}
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-black/60 px-3 py-2 text-sm text-white hover:border-neutral-600"
            >
              {askMeta?.imageUri && (
                <img
                  src={askMeta.imageUri}
                  alt={askMeta.symbol}
                  style={{ width: "16px", height: "16px", borderRadius: "50%" }}
                />
              )}
              <span>{askMeta?.symbol || "Select"}</span>
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
              <div className="absolute top-full right-0 left-0 mt-2 bg-black/40 border border-neutral-800 rounded-xl z-50 max-h-80 overflow-y-auto shadow-lg">
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
                        form.askDenom === token.denom
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
                      {form.askDenom === token.denom && (
                        <span className="text-xs">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Order Details Section */}
        <div className="rounded-xl border border-neutral-800 bg-black/40 p-4 space-y-4">
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/60 border-b border-white/10 pb-2">
            <span>Order Details</span>
            <span className="text-[11px] text-emerald-300">
              Slippage: {displaySpreadPercent.toFixed(1)}%
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Side Picker */}
            <label className="flex flex-col gap-1 text-sm text-white/80">
              Order Side
              <div className="relative" ref={sideMenuRef}>
                <button
                  type="button"
                  onClick={() => setSideMenuOpen(!sideMenuOpen)}
                  className="w-full rounded-lg border border-neutral-800 bg-black/60 px-3 py-2 text-sm text-white placeholder-white/40 outline-none focus:border-emerald-400/60 flex items-center justify-between"
                >
                  <span>{form.side === "buy" ? "Buy" : "Sell"}</span>
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
                {sideMenuOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-black/40 border border-neutral-800 rounded-lg z-50 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        handleChange("side", "buy");
                        setSideMenuOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-sm text-left transition-colors ${
                        form.side === "buy"
                          ? "bg-emerald-500/20 text-emerald-200"
                          : "text-white/70 hover:bg-white/5"
                      }`}
                    >
                      Buy (ask_denom)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleChange("side", "sell");
                        setSideMenuOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-sm text-left transition-colors ${
                        form.side === "sell"
                          ? "bg-emerald-500/20 text-emerald-200"
                          : "text-white/70 hover:bg-white/5"
                      }`}
                    >
                      Sell (offer_denom)
                    </button>
                  </div>
                )}
              </div>
            </label>

            {/* Limit Price */}
            <label className="flex flex-col gap-1 text-sm text-white/80">
              Limit Price
              <input
                type="text"
                value={form.limitPrice}
                onChange={(event) =>
                  handleChange("limitPrice", event.target.value)
                }
                placeholder="Price per token"
                className="rounded-lg border border-neutral-800 bg-black/60 px-3 py-2 text-sm text-white placeholder-white/40 outline-none focus:border-emerald-400/60"
                required
              />
            </label>
          </div>

          {/* <div className="flex items-center justify-between gap-3 text-xs text-white/60">
            <span>Adjust slippage below to control execution tolerance.</span>
            <button
              type="button"
              onClick={() => setSpreadMenuOpen(!spreadMenuOpen)}
              className="inline-flex items-center gap-2 rounded-full border border-emerald-400/50 bg-emerald-400/10 px-3 py-1.5 text-sm text-emerald-200 hover:bg-emerald-400/20"
            >
              Slippage: {displaySpreadPercent.toFixed(1)}%
            </button>
          </div> */}

          {/* Slippage Control */}
          {/* {spreadMenuOpen && (
            <div
              ref={spreadMenuRef}
              className="border-t border-white/10 pt-4 space-y-3"
            >
              <div className="flex gap-2">
                {[0.1, 0.5, 1].map((percent) => (
                  <button
                    key={percent}
                    type="button"
                    onClick={() => {
                      setCurrentSpreadPercent(percent);
                      setIsCustomSpread(false);
                      setSpreadMenuOpen(false);
                      if (onSlippageChange) {
                        onSlippageChange(percent);
                      }
                    }}
                    className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                      !isCustomSpread && currentSpreadPercent === percent
                        ? "bg-emerald-500/30 border border-emerald-400/60 text-emerald-200"
                        : "bg-white/5 border border-white/10 text-white/60 hover:bg-white/10"
                    }`}
                  >
                    {percent}%
                  </button>
                ))}
              </div>


              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-white/70">
                  <span>Custom (0-50%)</span>
                  <span>{customSpreadPercent.toFixed(2)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={50}
                  step={0.1}
                  value={customSpreadPercent}
                  onChange={(e) => setCustomSpreadPercent(Number(e.target.value))}
                  className="w-full accent-emerald-400"
                />
                <button
                  onClick={handleApplyCustomSpread}
                  className="w-full rounded-lg bg-emerald-500/20 px-3 py-2 text-sm text-emerald-200 border border-emerald-400/40 hover:bg-emerald-500/30"
                >
                  Apply Custom
                </button>
              </div>
            </div>
          )} */}
        </div>

        {/* Pool Address Section */}
        <div className="rounded-xl border border-neutral-800 bg-black/40 p-4 space-y-3">
          <label className="flex flex-col gap-1 text-sm text-white/80">
            Pool Address
            <input
              type="text"
              value={form.poolAddress || ""}
              onChange={(event) =>
                handleChange("poolAddress", event.target.value)
              }
              placeholder="zig1..."
              className="rounded-lg border border-neutral-800 bg-black/60 px-3 py-2 text-sm text-white placeholder-white/40 outline-none focus:border-emerald-400/60"
              required
            />
          </label>
        </div>

        {/* Active Orders Section */}
        {activeOrders.length > 0 && (
          <div className="rounded-xl border border-neutral-800 bg-black/40 p-4 space-y-3">
            <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/60 border-b border-white/10 pb-2">
              <span>Active Orders</span>
              <span className="text-emerald-300">{activeOrders.length}</span>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {activeOrders.map((order) => {
                const rawStatusInfo: OrderStatusInfo | undefined =
                  order.statusInfo ?? (order as any).status_info;
                const statusValue =
                  rawStatusInfo?.status ?? (order as any).status ?? "open";
                const statusLabel = formatOrderStatusLabel(statusValue);
                const statusBadgeClass = getOrderStatusBadgeClass(statusValue);
                const failureReason =
                  statusValue === "failed"
                    ? rawStatusInfo?.error?.message ??
                      rawStatusInfo?.error?.code ??
                      "unknown error"
                    : null;

                return (
                  <div
                    key={order.order_id}
                    className="rounded-lg border border-neutral-700 bg-black/60 p-3 text-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="font-medium text-white">
                            Order #{order.user_order_number ?? order.order_id}
                          </div>
                          <span
                            className={`text-[10px] font-semibold uppercase tracking-wide rounded-full border px-2 py-0.5 ${statusBadgeClass}`}
                          >
                            {statusLabel}
                          </span>
                        </div>
                        <div className="text-xs text-white/60">
                          {order.side} • Qty: {order.quantity} • Price:{" "}
                          {order.limit_price}
                        </div>
                        {failureReason && (
                          <div className="mt-1 text-[11px] text-red-200">
                            Order failed due to {failureReason}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCancelOrder(order.order_id)}
                        disabled={
                          canceling && cancelOrderId === order.order_id
                        }
                        className="ml-2 px-2 py-1 rounded text-xs bg-red-500/20 text-red-300 border border-red-400/30 hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {canceling && cancelOrderId === order.order_id
                          ? "Cancelling…"
                          : "Cancel"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Submit Button & Status */}
        {queryClientError && (
          <div className="text-xs text-red-300 bg-red-500/10 border border-red-400/30 rounded-lg p-2">
            {String(queryClientError.message || queryClientError)}
          </div>
        )}
        <div className="flex flex-col gap-2">
          <button
            type="submit"
            disabled={!canSubmit || isSubmitting || queryClientLoading}
            className="w-full bg-emerald-500 text-black font-medium py-3 rounded-lg hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? "Placing Order…" : "Place Limit Order"}
          </button>

          {(activeOrdersLoading || queryClientLoading) && (
            <div className="space-y-1 text-xs text-white/60">
              {activeOrdersLoading && <div>Loading active orders…</div>}
              {queryClientLoading && <div>Initializing contract…</div>}
            </div>
          )}

          {submitState.status !== "idle" && submitState.message && (
            <div
              className={`text-xs rounded-lg border px-3 py-2 ${submitStatusMeta.boxClass}`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`text-[11px] font-semibold uppercase tracking-wide rounded-full border px-2 py-0.5 ${submitStatusMeta.badgeClass}`}
                >
                  {submitStatusMeta.label}
                </span>
                <p className="text-white/80 flex-1">{submitStatusMessage}</p>
              </div>
              {submitState.status === "success" && submitState.txHash && (
                <a
                  href={`${EXPLORER_BASE_URL}${submitState.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-200 underline hover:text-emerald-100"
                >
                  View tx →
                </a>
              )}
            </div>
          )}

          {cancelMessage && (
            <div className="text-xs text-yellow-300 bg-yellow-500/10 border border-yellow-400/30 rounded-lg p-2">
              {cancelMessage}
            </div>
          )}

          {!isConnected && (
            <div className="text-xs text-red-300 bg-red-500/10 border border-red-400/30 rounded-lg p-2">
              Connect wallet to place orders
            </div>
          )}
        </div>
      </form>
    </>
  );
}
