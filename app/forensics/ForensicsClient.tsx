"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, RefreshCcw, Search, X } from "lucide-react";
import ForensicsCanvas from "./ForensicsCanvas";
import CanvasSkeleton from "./CanvasSkeleton";
import ForensicsEmptyState from "./ForensicsEmptyState";
import ForensicsPanel from "./ForensicsPanel";
import ForensicsToolbar from "./ForensicsToolbar";
import {
  getForensicsCounterparties,
  getForensicsContracts,
  getForensicsProfile,
  getForensicsRisk,
  getForensicsStaking,
  getForensicsTimeline,
  getForensicsTokenFlow,
  getForensicsTransfers,
} from "../../lib/api/forensics";
import { getEnrichedTokenMetadata } from "../../lib/forensics/tokenMetadata";
import {
  formatHighPrecisionAmount,
  formatRelativeTime,
  formatTimestamp,
  getAddressByLabel,
  getHotWalletInfo,
} from "../../lib/forensics/utils";
import { bech32 } from "bech32";
import {
  ForensicsProfile,
  ForensicsCounterparty,
  ForensicsTransfer,
  ForensicsTokenFlow,
  ForensicsTimeline,
  ForensicsContracts,
  ForensicsStaking,
  ForensicsRisk,
} from "../../lib/api/forensics";
import { CounterpartyGroup } from "./types";

const DEFAULT_LIMIT = 50;
const STORAGE_KEY = "zigscan_forensics_recent";
type ForensicsTokenMeta = {
  symbol: string;
  decimals?: number;
  imageUrl?: string;
};

const resolveForensicsTokenMeta = (
  denom: string,
  tokenMetadata?: Record<string, ForensicsTokenMeta>,
): ForensicsTokenMeta => {
  if (denom === "uzig") {
    return {
      symbol: "ZIG",
      decimals: 6,
      imageUrl: tokenMetadata?.[denom]?.imageUrl,
    };
  }

  return (
    tokenMetadata?.[denom] || {
      symbol: denom,
      decimals: 0,
    }
  );
};

const ZIG_REGEX = /^zig1[023456789acdefghjklmnpqrstuvwxyz]{38,72}$/i;

const isValidZigAddress = (addr: string) => {
  const normalized = addr.trim();
  if (!ZIG_REGEX.test(normalized)) return false;

  try {
    const decoded = bech32.decode(normalized.toLowerCase());
    const data = Uint8Array.from(bech32.fromWords(decoded.words));
    // Support both 20-byte (wallet) and 32-byte (contract) addresses
    return (
      decoded.prefix === "zig" && (data.length === 20 || data.length === 32)
    );
  } catch {
    return false;
  }
};

const compactNumber = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 2,
});

const parseNumeric = (value: string | number | null | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatCompactTokenAmount = (value: string | number, decimals = 0) => {
  const numeric = parseNumeric(value);
  const normalized = decimals > 0 ? numeric / Math.pow(10, decimals) : numeric;
  return compactNumber.format(normalized);
};

const formatRelative = (value?: string | null) => {
  if (!value) return "Never";
  try {
    return formatRelativeTime(value);
  } catch {
    return value;
  }
};

const formatInteractionRange = (
  first?: string | null,
  last?: string | null,
) => {
  const firstFormatted = first ? formatTimestamp(first) : "";
  const lastFormatted = last ? formatTimestamp(last) : "";

  if (firstFormatted && lastFormatted) {
    return firstFormatted === lastFormatted
      ? lastFormatted
      : `${firstFormatted} to ${lastFormatted}`;
  }

  return lastFormatted || firstFormatted || "Time unavailable";
};

const buildGroupLabel = (
  row: ForensicsCounterparty,
  tokenMetadata: Record<string, ForensicsTokenMeta>,
) => {
  if ((row.denoms || []).length === 1) {
    const denom = row.denoms[0];
    const metadata = resolveForensicsTokenMeta(denom, tokenMetadata);
    return `${formatCompactTokenAmount(row.total_amount, metadata?.decimals ?? 0)} ${metadata?.symbol || denom}`;
  }
  if ((row.denoms || []).length > 1) {
    return `Across ${row.denoms.length} assets`;
  }
  return compactNumber.format(parseNumeric(row.total_amount));
};

const truncateMiddle = (value: string, start = 12, end = 10) => {
  if (!value) return "";
  if (value.length <= start + end + 3) return value;
  return `${value.slice(0, start)}...${value.slice(-end)}`;
};

function PartialBadge() {
  return (
    <div className="forensics-soft-warning">
      <AlertTriangle className="h-3.5 w-3.5" />
      <span>Partial data returned</span>
    </div>
  );
}

export default function ForensicsClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const isFetchingRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const hudDragStartRef = useRef({ x: 0, y: 0 });
  const hudStartPosRef = useRef({ x: 0, y: 0 });
  const hudAnimationFrameRef = useRef<number | null>(null);
  const hudPendingMouseEventRef = useRef<globalThis.MouseEvent | null>(null);
  const tokenMetadataCacheRef = useRef<Map<string, ForensicsTokenMeta>>(
    new Map(),
  );

  const [address, setAddress] = useState(
    () => searchParams.get("address") || "",
  );
  const [txLimit, setTxLimit] = useState(() => {
    const urlLimit = Number(searchParams.get("limit") || DEFAULT_LIMIT);
    return Number.isFinite(urlLimit) ? urlLimit : DEFAULT_LIMIT;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [profile, setProfile] = useState<ForensicsProfile | null>(null);
  const [counterparties, setCounterparties] = useState<ForensicsCounterparty[]>(
    [],
  );
  const [graphPartial, setGraphPartial] = useState(false);
  const [profilePartial, setProfilePartial] = useState(false);

  const [activePanel, setActivePanel] = useState<
    "detail" | "transactions" | "profile" | null
  >(null);
  const [selectedGroup, setSelectedGroup] = useState<{
    side: "L" | "R";
    group: CounterpartyGroup;
  } | null>(null);
  const [transfers, setTransfers] = useState<ForensicsTransfer[]>([]);
  const [transfersMeta, setTransfersMeta] = useState({
    page: 1,
    limit: 20,
    total: 0,
    hasMore: false,
  });
  const [transfersLoading, setTransfersLoading] = useState(false);
  const [transferPartial, setTransferPartial] = useState(false);
  const [searching, setSearching] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [tokenMetadata, setTokenMetadata] = useState<
    Record<string, ForensicsTokenMeta>
  >({});
  const [tokenFlow, setTokenFlow] = useState<ForensicsTokenFlow | null>(null);
  const [timeline, setTimeline] = useState<ForensicsTimeline | null>(null);
  const [contracts, setContracts] = useState<ForensicsContracts | null>(null);
  const [staking, setStaking] = useState<ForensicsStaking | null>(null);
  const [risk, setRisk] = useState<ForensicsRisk | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsLoadedFor, setAnalyticsLoadedFor] = useState<string | null>(
    null,
  );
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [hudPosition, setHudPosition] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [isHudDragging, setIsHudDragging] = useState(false);

  const rememberRecent = useCallback((value: string) => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      const next = [
        value,
        ...(Array.isArray(parsed) ? parsed : []).filter(
          (entry) => entry !== value,
        ),
      ].slice(0, 5);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage issues in private browsing / restricted environments.
    }
  }, []);

  useEffect(() => {
    const denoms = Array.from(
      new Set(
        counterparties
          .flatMap((row) => (Array.isArray(row.denoms) ? row.denoms : []))
          .filter(Boolean),
      ),
    );

    const pending = denoms.filter(
      (denom) => !tokenMetadataCacheRef.current.has(denom),
    );
    if (pending.length === 0) {
      const nextMetadata: Record<string, ForensicsTokenMeta> = {};
      denoms.forEach((denom) => {
        const metadata = tokenMetadataCacheRef.current.get(denom);
        if (metadata) nextMetadata[denom] = metadata;
      });
      setTokenMetadata(nextMetadata);
      return;
    }

    let cancelled = false;

    const resolveDenomMetadata = async (
      denom: string,
    ): Promise<ForensicsTokenMeta> => {
      const res = await getEnrichedTokenMetadata(denom);
      return {
        symbol: res.result.metadata.symbol,
        decimals: res.result.metadata.decimals,
        imageUrl: res.result.metadata.image_url ?? undefined,
      };
    };

    void (async () => {
      const resolved = await Promise.all(
        pending.map(
          async (denom) => [denom, await resolveDenomMetadata(denom)] as const,
        ),
      );

      if (cancelled) return;

      resolved.forEach(([denom, metadata]) => {
        tokenMetadataCacheRef.current.set(denom, metadata);
      });

      const nextMetadata: Record<string, ForensicsTokenMeta> = {};
      denoms.forEach((denom) => {
        const metadata = tokenMetadataCacheRef.current.get(denom);
        if (metadata) nextMetadata[denom] = metadata;
      });
      setTokenMetadata(nextMetadata);
    })();

    return () => {
      cancelled = true;
    };
  }, [counterparties]);

  const senderGroups = useMemo(
    () =>
      counterparties
        .filter((row) => row.direction === "received")
        .map((row) => ({
          ...row,
          transactions: Array.from(
            { length: Number(row.tx_count || 0) },
            () => ({}),
          ),
          totalVolumeFormatted: buildGroupLabel(row, tokenMetadata),
          tokenImageUrl:
            row.denoms?.length === 1
              ? tokenMetadata[row.denoms[0]]?.imageUrl
              : undefined,
          edgeTimeRange: formatInteractionRange(
            row.first_interaction,
            row.last_interaction,
          ),
          totalVolumeColor: "text-teal-300",
          lastActiveFormatted: formatRelative(row.last_interaction),
        })),
    [counterparties, tokenMetadata],
  );

  const recipientGroups = useMemo(
    () =>
      counterparties
        .filter((row) => row.direction === "sent")
        .map((row) => ({
          ...row,
          transactions: Array.from(
            { length: Number(row.tx_count || 0) },
            () => ({}),
          ),
          totalVolumeFormatted: buildGroupLabel(row, tokenMetadata),
          tokenImageUrl:
            row.denoms?.length === 1
              ? tokenMetadata[row.denoms[0]]?.imageUrl
              : undefined,
          edgeTimeRange: formatInteractionRange(
            row.first_interaction,
            row.last_interaction,
          ),
          totalVolumeColor: "text-amber-300",
          lastActiveFormatted: formatRelative(row.last_interaction),
        })),
    [counterparties, tokenMetadata],
  );

  const makeNodeId = useCallback(
    (side: "L" | "R", group: ForensicsCounterparty, idx: number) => {
      const normalized = String(group.address || "anonymous")
        .replace(/[^a-zA-Z0-9]/g, "")
        .toLowerCase();
      return `${side}-${normalized}-${idx}`;
    },
    [],
  );

  const syncUrl = useCallback(
    (nextAddress: string, nextLimit: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextAddress) {
        params.set("address", nextAddress);
      } else {
        params.delete("address");
      }
      if (nextLimit !== DEFAULT_LIMIT) {
        params.set("limit", String(nextLimit));
      } else {
        params.delete("limit");
      }
      const next = params.toString()
        ? `${pathname}?${params.toString()}`
        : pathname;
      router.replace(next, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const closePanel = useCallback(() => {
    setActivePanel(null);
    setSelectedGroup(null);
    setTransfers([]);
    setTransferPartial(false);
    setTransfersMeta({ page: 1, limit: 20, total: 0, hasMore: false });
  }, []);

  const loadPrimary = useCallback(
    async (targetAddress: string, limit: number) => {
      try {
        setLoading(true);
        setError(null);
        const [profileResult, counterpartyResult] = await Promise.all([
          getForensicsProfile(targetAddress),
          getForensicsCounterparties(targetAddress, { limit }),
        ]);

        setProfile(profileResult);
        setProfilePartial(Boolean(profileResult?.partial));
        setCounterparties(
          Array.isArray(counterpartyResult?.counterparties)
            ? counterpartyResult.counterparties
            : [],
        );
        setGraphPartial(Boolean(counterpartyResult?.partial));
        setTokenFlow(null);
        setTimeline(null);
        setContracts(null);
        setStaking(null);
        setRisk(null);
        setAnalyticsLoadedFor(null);
        setAnalyticsError(null);
        closePanel();
        rememberRecent(targetAddress);
      } catch (err: unknown) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to load forensics data.";
        setProfile(null);
        setCounterparties([]);
        closePanel();
        setError(errorMessage);
      } finally {
        setLoading(false);
        isFetchingRef.current = false;
      }
    },
    [closePanel, rememberRecent],
  );

  const handleSearch = useCallback(
    async (input: string, limitOverride?: number) => {
      let normalized = input.trim();

      // Resolve labels (e.g. "mexc" -> zig1...)
      const resolvedAddress = getAddressByLabel(normalized);
      if (resolvedAddress) {
        normalized = resolvedAddress;
      }

      const nextLimit = limitOverride ?? txLimit;
      if (!normalized) {
        setError("Address required.");
        return;
      }
      if (!isValidZigAddress(normalized)) {
        setError("Enter a valid wallet or contract address.");
        return;
      }

      // Just update the URL. The useEffect will detect the change and call loadPrimary.
      syncUrl(normalized, nextLimit);
    },
    [syncUrl, txLimit],
  );

  const isInitialMountRef = useRef(true);

  useEffect(() => {
    const urlAddress = searchParams.get("address") || "";
    const urlLimit = Number(searchParams.get("limit") || DEFAULT_LIMIT);
    const effectiveLimit = Number.isFinite(urlLimit) ? urlLimit : DEFAULT_LIMIT;

    const isDifferent = urlAddress !== address || effectiveLimit !== txLimit;
    const isMissingData = urlAddress && !profile && !loading && !error;

    if (
      (isDifferent || (isInitialMountRef.current && isMissingData)) &&
      !isFetchingRef.current
    ) {
      isInitialMountRef.current = false;
      setAddress(urlAddress);
      setTxLimit(effectiveLimit);

      if (urlAddress) {
        isFetchingRef.current = true;
        void loadPrimary(urlAddress, effectiveLimit);
      }
    } else if (!urlAddress && address) {
      // Clear all states when navigating home
      setAddress("");
      setTxLimit(DEFAULT_LIMIT);
      setProfile(null);
      setCounterparties([]);
      setTokenFlow(null);
      setTimeline(null);
      setContracts(null);
      setStaking(null);
      setRisk(null);
      setAnalyticsLoadedFor(null);
      setAnalyticsError(null);
      setGraphPartial(false);
      setProfilePartial(false);
      setError(null);
      closePanel();
      isFetchingRef.current = false;
    }

    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
    }
  }, [
    address,
    searchParams,
    txLimit,
    loadPrimary,
    closePanel,
    profile,
    loading,
    error,
  ]);

  const loadTransfers = useCallback(
    async (group: ForensicsCounterparty, page = 1) => {
      if (!address || !group?.address) return;
      try {
        setTransfersLoading(true);
        setError(null);
        const selectedDenom =
          Array.isArray(group?.denoms) && group.denoms.length === 1
            ? group.denoms[0]
            : undefined;
        const result = await getForensicsTransfers(address, group.address, {
          page,
          limit: 20,
          denom: selectedDenom,
          includeCount: false,
        });
        setTransfers(Array.isArray(result?.data) ? result.data : []);
        setTransfersMeta(
          result?.meta || { page, limit: 20, total: 0, hasMore: false },
        );
        setTransferPartial(Boolean(result?.partial));
      } catch (err: unknown) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : "Failed to load bilateral transfers.";
        setTransfers([]);
        setTransfersMeta({ page, limit: 20, total: 0, hasMore: false });
        setTransferPartial(false);
        setError(errorMessage);
      } finally {
        setTransfersLoading(false);
      }
    },
    [address],
  );

  const loadAnalytics = useCallback(async () => {
    if (!address || analyticsLoading || analyticsLoadedFor === address) return;

    try {
      setAnalyticsLoading(true);
      setAnalyticsError(null);

      const [
        tokenFlowResult,
        timelineResult,
        contractsResult,
        stakingResult,
        riskResult,
      ] = await Promise.all([
        getForensicsTokenFlow(address, { range: "all" }),
        getForensicsTimeline(address, { range: "90d", interval: "1d" }),
        getForensicsContracts(address, { limit: 12 }),
        getForensicsStaking(address),
        getForensicsRisk(address),
      ]);

      setTokenFlow(tokenFlowResult);
      setTimeline(timelineResult);
      setContracts(contractsResult);
      setStaking(stakingResult);
      setRisk(riskResult);
      setAnalyticsLoadedFor(address);
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to load advanced forensics analytics.";
      setAnalyticsError(errorMessage);
    } finally {
      setAnalyticsLoading(false);
    }
  }, [address, analyticsLoadedFor, analyticsLoading]);

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      if (nodeId === "C" || nodeId === address) {
        setSelectedGroup(null);
        setTransfers([]);
        setTransfersMeta({ page: 1, limit: 20, total: 0, hasMore: false });
        setActivePanel("profile");
        void loadAnalytics();
        return;
      }

      const findGroup = (list: CounterpartyGroup[], side: "L" | "R") => {
        for (let idx = 0; idx < list.length; idx += 1) {
          const group = list[idx];
          if (makeNodeId(side, group, idx) === nodeId) {
            return { side, group };
          }
        }
        return null;
      };

      const hit =
        findGroup(senderGroups, "L") || findGroup(recipientGroups, "R");
      if (!hit) return;

      setSelectedGroup(hit);
      setActivePanel("detail");
      void loadTransfers(hit.group, 1);
    },
    [address, loadAnalytics, loadTransfers, makeNodeId, recipientGroups, senderGroups],
  );

  const handleToolbarToggle = useCallback(
    (panel: "detail" | "transactions" | "profile") => {
      if (activePanel === panel) {
        closePanel();
        return;
      }

      setActivePanel(panel);
      if (panel === "transactions" && selectedGroup) {
        void loadTransfers(selectedGroup.group, 1);
      }
      if (panel === "profile") {
        void loadAnalytics();
      }
    },
    [activePanel, closePanel, loadAnalytics, loadTransfers, selectedGroup],
  );

  const clearSearch = useCallback(() => {
    setAddress("");
    setTxLimit(DEFAULT_LIMIT);
    setProfile(null);
    setCounterparties([]);
    setTokenFlow(null);
    setTimeline(null);
    setContracts(null);
    setStaking(null);
    setRisk(null);
    setAnalyticsLoadedFor(null);
    setAnalyticsError(null);
    setGraphPartial(false);
    setProfilePartial(false);
    setError(null);
    closePanel();
    syncUrl("", DEFAULT_LIMIT);
  }, [closePanel, syncUrl]);

  const panelOpen = Boolean(activePanel);
  const partialFlags = [profilePartial, graphPartial, transferPartial].some(
    Boolean,
  );

  const clampHudPosition = useCallback((x: number, y: number) => {
    if (typeof window === "undefined") return { x, y };
    const margin = 8;
    const hudWidth = 680;
    const hudHeight = 58;
    return {
      x: Math.min(Math.max(margin, x), Math.max(margin, window.innerWidth - hudWidth - margin)),
      y: Math.min(Math.max(margin, y), Math.max(margin, window.innerHeight - hudHeight - margin)),
    };
  }, []);

  const handleHudDragStart = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (
        target.closest("button") ||
        target.closest("input") ||
        target.closest("a")
      ) {
        return;
      }

      const rect = event.currentTarget.getBoundingClientRect();
      const start = hudPosition ?? { x: rect.left, y: rect.top };
      hudDragStartRef.current = { x: event.clientX, y: event.clientY };
      hudStartPosRef.current = start;
      setHudPosition(start);
      setIsHudDragging(true);
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
      event.preventDefault();
    },
    [hudPosition],
  );

  useEffect(() => {
    if (!isHudDragging) return;

    const processMove = (event: globalThis.MouseEvent) => {
      const dx = event.clientX - hudDragStartRef.current.x;
      const dy = event.clientY - hudDragStartRef.current.y;
      const next = clampHudPosition(
        hudStartPosRef.current.x + dx,
        hudStartPosRef.current.y + dy,
      );
      setHudPosition(next);
    };

    const handleMouseMove = (event: globalThis.MouseEvent) => {
      hudPendingMouseEventRef.current = event;
      if (hudAnimationFrameRef.current === null) {
        hudAnimationFrameRef.current = window.requestAnimationFrame(() => {
          hudAnimationFrameRef.current = null;
          const nextEvent = hudPendingMouseEventRef.current;
          hudPendingMouseEventRef.current = null;
          if (nextEvent) processMove(nextEvent);
        });
      }
    };

    const handleMouseUp = () => {
      if (hudAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(hudAnimationFrameRef.current);
        hudAnimationFrameRef.current = null;
      }
      hudPendingMouseEventRef.current = null;
      setIsHudDragging(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      if (hudAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(hudAnimationFrameRef.current);
        hudAnimationFrameRef.current = null;
      }
      hudPendingMouseEventRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [clampHudPosition, isHudDragging]);

  useEffect(() => {
    if (!hudPosition) return;
    const handleResize = () => {
      setHudPosition((current) =>
        current ? clampHudPosition(current.x, current.y) : current,
      );
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [clampHudPosition, hudPosition]);

  const openSearch = useCallback(() => {
    setInputVal("");
    setInvalid(false);
    setSearching(true);
    window.setTimeout(() => searchInputRef.current?.focus(), 50);
  }, []);

  const cancelSearch = useCallback(() => {
    setSearching(false);
    setInvalid(false);
    setInputVal("");
  }, []);

  const submitSearch = useCallback(() => {
    let nextValue = inputVal.trim();

    // Resolve labels (e.g. "mexc" -> zig1...)
    const resolvedAddress = getAddressByLabel(nextValue);
    if (resolvedAddress) {
      nextValue = resolvedAddress;
    }

    if (!isValidZigAddress(nextValue)) {
      setInvalid(true);
      return;
    }
    // Update local state immediately to trigger loading/canvas transition
    void handleSearch(nextValue, txLimit);
    setSearching(false);
    setInvalid(false);
  }, [inputVal, handleSearch, txLimit]);

  const navigateToForensicsHome = useCallback(() => {
    router.push("/forensics");
  }, [router]);

  const handleExploreAddress = useCallback(
    (value: string) => {
      void handleSearch(value, txLimit);
    },
    [handleSearch, txLimit],
  );

  const handleRefresh = useCallback(() => {
    void handleSearch(address, txLimit);
  }, [address, handleSearch, txLimit]);

  const hudStyle = useMemo<CSSProperties | undefined>(() => {
    if (!hudPosition) return undefined;
    return {
      left: 0,
      top: 0,
      right: "auto",
      transform: `translate3d(${hudPosition.x}px, ${hudPosition.y}px, 0)`,
    };
  }, [hudPosition]);

  if (!address) {
    return (
      <div className="absolute inset-0 flex items-center justify-center overflow-auto">
        <ForensicsEmptyState
          onSearch={(value) => void handleSearch(value, txLimit)}
          loading={loading}
          error={error}
        />
      </div>
    );
  }

  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0">
        {loading ? (
          <CanvasSkeleton progress={70} />
        ) : (
          <div className={`absolute inset-0 ${panelOpen ? "panel-open" : ""}`}>
            <ForensicsCanvas
              centerLabel={address}
              senderAccounts={senderGroups}
              recipientAccounts={recipientGroups}
              loading={false}
              overlayMessage={
                !loading && senderGroups.length + recipientGroups.length === 0
                  ? "No counterparty graph data found for this address."
                  : null
              }
              onNodeClick={handleNodeClick}
              getNodeId={makeNodeId}
              onCanvasClick={closePanel}
              onExploreAddress={handleExploreAddress}
            />
          </div>
        )}
      </div>

      <div className="forensics-overlay-layer forensics-overlay-no-nav">
        <div
          className={`forensics-hud pointer-events-auto ${
            isHudDragging ? "forensics-hud-dragging" : ""
          } ${hudPosition ? "forensics-hud-positioned" : ""}`}
          onMouseDown={handleHudDragStart}
          style={hudStyle}
        >
          <div className="forensics-address-readout">
            <span className="forensics-hud-label">Address</span>
            {searching ? (
              <input
                ref={searchInputRef}
                value={inputVal}
                onChange={(event) => {
                  setInputVal(event.target.value);
                  setInvalid(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitSearch();
                  if (event.key === "Escape") cancelSearch();
                }}
                placeholder="Enter zig1... address"
                className={`forensics-hud-search-input ${invalid ? "invalid" : ""}`}
                aria-label="Search another address"
              />
            ) : (
              <input
                readOnly
                value={
                  getHotWalletInfo(address)?.label || truncateMiddle(address)
                }
                aria-label="Current address"
              />
            )}
          </div>
          {partialFlags ? <PartialBadge /> : null}
          <button
            type="button"
            className="forensics-hud-btn"
            onClick={handleRefresh}
          >
            <RefreshCcw className="h-4 w-4" />
            <span>Refresh</span>
          </button>
          {searching ? (
            <>
              <button
                type="button"
                className="forensics-hud-btn"
                onClick={submitSearch}
              >
                <span>Go</span>
              </button>
              <button
                type="button"
                className="forensics-hud-btn-ghost"
                onClick={cancelSearch}
                aria-label="Cancel search"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          ) : (
            <button
              type="button"
              className="forensics-hud-btn"
              onClick={openSearch}
            >
              <Search className="h-4 w-4" />
              <span>Search Again</span>
            </button>
          )}
        </div>

        <div className="forensics-back-button-wrap pointer-events-auto">
          <button
            type="button"
            className="forensics-back-home-btn"
            title="Return to search"
            onClick={navigateToForensicsHome}
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back To Home</span>
          </button>
        </div>

        <ForensicsToolbar
          activePanel={activePanel}
          onToggle={handleToolbarToggle}
        />

        {error ? (
          <div className="forensics-floating-error pointer-events-auto">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
      </div>

      <ForensicsPanel
        open={panelOpen}
        variant={activePanel || "detail"}
        selectedGroup={selectedGroup}
        centerAddress={address}
        onClose={closePanel}
        transfers={transfers}
        transfersMeta={transfersMeta}
        transfersLoading={transfersLoading}
        onTransfersPageChange={(page) =>
          selectedGroup && void loadTransfers(selectedGroup.group, page)
        }
        profile={profile}
        tokenFlow={tokenFlow}
        timeline={timeline}
        contracts={contracts}
        staking={staking}
        risk={risk}
        tokenMetadata={tokenMetadata}
        analyticsLoading={analyticsLoading}
        analyticsError={analyticsError}
      />
    </div>
  );
}
