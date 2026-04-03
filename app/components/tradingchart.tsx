/* eslint-disable @next/next/no-img-element */
"use client";

import {
  CandlestickData,
  ColorType,
  createChart,
  CrosshairMode,
  HistogramData,
  IChartApi,
  ISeriesApi,
  SeriesMarker,
  Time,
  UTCTimestamp,
} from "lightweight-charts";
import { Copy, Expand, RefreshCw, Share2 } from "lucide-react";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { SignerFilterSummary } from "@/app/components/RecentTrades";
import { API_BASE_URL, API_HEADERS } from "@/lib/api";

declare global {
  interface Window {
    tradingViewWidget?: any;
    TradingView?: any;
  }
}

/* ---------- CONFIG ---------- */
const API_BASE = API_BASE_URL;
const WS_URL =
  process.env.NEXT_PUBLIC_TRADES_WS_URL || "ws://159.223.28.88:3000/ws";
const NATIVE_DENOM = "uzig";
// green for buys, red for sells – used for candlesticks and markers
const CANDLE_UP_COLOR = "#20D87C"; // bright green
const CANDLE_DOWN_COLOR = "#F64F39"; // bright red

function fetchApi(url: string, init: RequestInit = {}) {
  return fetch(url, {
    ...init,
    headers: { ...API_HEADERS, ...(init.headers || {}) },
  });
}

/* ---------- helpers ---------- */
function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

async function waitForTradingView(maxMs = 6000): Promise<void> {
  const start = Date.now();
  while (!(window as any).TradingView?.widget) {
    await new Promise((r) => setTimeout(r, 40));
    if (Date.now() - start > maxMs) {
      throw new Error(
        "TradingView global not found. Check /charting_library path and bundles/"
      );
    }
  }
}

function alignFloor(tsSec: number, stepSec: number) {
  return Math.floor(tsSec / stepSec) * stepSec;
}

/** TV resolution -> your tf */
type TfKey = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
const TF_MAP: Record<string, TfKey> = {
  "1": "1m",
  "5": "5m",
  "15": "15m",
  "60": "1h",
  "240": "4h",
  "1D": "1d",
};
const STEP_SEC: Record<TfKey, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
};

type FeedCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type SwapDir = "buy" | "sell";

type ParsedSwap = {
  price: number;
  volume: number;
  dir?: SwapDir;
  tsMs: number;
};

// Tendermint WS helpers
type WsEvent = any;
const base64Re = /^[A-Za-z0-9+/=]+$/;
function decodeBase64Maybe(value: string): string {
  if (!value) return "";
  if (!base64Re.test(value)) return value;
  try {
    return atob(value);
  } catch {
    return value;
  }
}
function extractEventsFromWs(msg: WsEvent): any[] {
  const flat = msg?.result?.events;
  if (flat) {
    const byType: Record<
      string,
      { type: string; attributes: { key: string; value: string }[] }
    > = {};
    for (const [k, vals] of Object.entries(flat)) {
      const dot = k.indexOf(".");
      if (dot <= 0) continue;
      const type = k.slice(0, dot);
      const key = k.slice(dot + 1);
      if (!byType[type]) byType[type] = { type, attributes: [] };
      const valList = Array.isArray(vals) ? vals : vals ? [vals] : [];
      valList.forEach((v: any) =>
        byType[type].attributes.push({ key, value: String(v) })
      );
    }
    return Object.values(byType);
  }
  const structured = msg?.result?.data?.value?.TxResult?.result?.events;
  if (!Array.isArray(structured) || !structured.length) return [];
  return structured.map((e: any) => ({
    type: decodeBase64Maybe(String(e?.type ?? "")),
    attributes: Array.isArray(e?.attributes)
      ? e.attributes.map((a: any) => ({
          key: decodeBase64Maybe(String(a?.key ?? "")),
          value: decodeBase64Maybe(String(a?.value ?? "")),
        }))
      : [],
  }));
}

function getWasmAttrs(events: any[]): { key: string; value: string }[] {
  const wasm = events.find((e: any) => e?.type === "wasm");
  return (wasm?.attributes || []).map((a: any) => ({
    key: String(a?.key ?? ""),
    value: String(a?.value ?? ""),
  }));
}

function parseReservesString(str: string): Record<string, number> {
  const out: Record<string, number> = {};
  String(str)
    .split(",")
    .forEach((p) => {
      const i = p.indexOf(":");
      if (i > 0) {
        const k = p.slice(0, i).trim();
        const v = Number(p.slice(i + 1).trim());
        if (!Number.isNaN(v)) out[k] = v;
      }
    });
  return out;
}

const pow10 = (n: number) => (n === 6 ? 1_000_000 : Math.pow(10, n));

function resolveTokenExponent(data: any, fallback = 6): number {
  const candidates = [
    data?.exponent,
    data?.decimals,
    data?.denom_exponent,
    data?.denomExponent,
    data?.display_exponent,
    data?.metadata?.exponent,
    data?.metadata?.display_exponent,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return fallback;
}

function derivePriceFromReserves(
  attrs: { key: string; value: string }[],
  tokenDenom: string,
  tokenExponent: number
): number | null {
  const reservesStr = attrs.find((a) => a.key === "reserves")?.value;
  if (!reservesStr) return null;
  const res = parseReservesString(reservesStr);
  const denoms = Object.keys(res);
  if (denoms.length < 2) return null;
  const normalizedToken = tokenDenom.toLowerCase();
  const zigKey = denoms.find((d) => d.includes(NATIVE_DENOM));
  const tokenKey =
    denoms.find((d) => d.toLowerCase() === normalizedToken) ||
    denoms.find((d) => d !== zigKey) ||
    denoms[0];
  if (!zigKey || !tokenKey) return null;
  const zigHuman = res[zigKey] / pow10(6);
  const tokHuman = res[tokenKey] / pow10(tokenExponent);
  if (!(zigHuman > 0 && tokHuman > 0)) return null;
  const price = zigHuman / tokHuman;
  return Number.isFinite(price) ? price : null;
}

function priceFromAmounts(
  attrs: { key: string; value: string }[],
  tokenDenom: string,
  tokenExponent: number
): number | null {
  const offerAsset = attrs.find((a) => a.key === "offer_asset")?.value || "";
  const askAsset = attrs.find((a) => a.key === "ask_asset")?.value || "";
  const offerStr = attrs.find((a) => a.key === "offer_amount")?.value || "0";
  const returnStr = attrs.find((a) => a.key === "return_amount")?.value || "0";
  const offerAmt = offerStr.includes("e-")
    ? parseFloat(offerStr)
    : parseInt(offerStr, 10) || 0;
  const returnAmt = returnStr.includes("e-")
    ? parseFloat(returnStr)
    : parseInt(returnStr, 10) || 0;
  if (!offerAmt || !returnAmt) return null;
  const sym = tokenDenom.toLowerCase();
  if (offerAsset.includes(NATIVE_DENOM) && askAsset.toLowerCase().includes(sym)) {
    const zig = offerAmt / 1e6;
    const tok = returnAmt / pow10(tokenExponent);
    return tok > 0 ? zig / tok : null;
  } else if (offerAsset.toLowerCase().includes(sym) && askAsset.includes(NATIVE_DENOM)) {
    const tok = offerAmt / pow10(tokenExponent);
    const zig = returnAmt / 1e6;
    return tok > 0 ? zig / tok : null;
  }
  return null;
}

function volumeZig(attrs: { key: string; value: string }[]) {
  const offerAsset = attrs.find((a) => a.key === "offer_asset")?.value;
  const askAsset = attrs.find((a) => a.key === "ask_asset")?.value;
  const offerAmt = Number(attrs.find((a) => a.key === "offer_amount")?.value || 0);
  const returnAmt = Number(attrs.find((a) => a.key === "return_amount")?.value || 0);
  if (offerAsset === NATIVE_DENOM) return offerAmt / 1e6;
  if (askAsset === NATIVE_DENOM) return returnAmt / 1e6;
  return 0;
}

function deriveSwapFromWs(
  msg: WsEvent,
  tokenDenom: string,
  tokenExponent: number
): ParsedSwap | null {
  const events = extractEventsFromWs(msg);
  if (!events.length) return null;
  const attrs = getWasmAttrs(events);
  if (!attrs.length) return null;

  const action = attrs.find((a) => a.key === "action")?.value;
  if (action !== "swap") return null;

  const reservesStr = attrs.find((a) => a.key === "reserves")?.value;
  const beliefPriceRaw = attrs.find((a) => a.key === "belief_price")?.value;
  const normalizedToken = tokenDenom.toLowerCase();

  const reservesPrice = (() => {
    if (!reservesStr) return null;
    const parts = String(reservesStr)
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (!parts.length) return null;
    const firstKey = parts[0].split(":")[0] || "";
    const res = parseReservesString(reservesStr);
    const zigKey = Object.keys(res).find((k) => k.includes(NATIVE_DENOM));
    const tokenKey =
      Object.keys(res).find((k) => k.toLowerCase() === normalizedToken) ||
      Object.keys(res).find((k) => k !== zigKey);
    if (!zigKey || !tokenKey) return null;
    const zigHuman = res[zigKey] / pow10(6);
    const tokHuman = res[tokenKey] / pow10(tokenExponent);
    if (!(zigHuman > 0 && tokHuman > 0)) return null;

    const dir: SwapDir =
      firstKey.includes(NATIVE_DENOM) || firstKey === zigKey ? "buy" : "sell";

    return { price: zigHuman / tokHuman, dir };
  })();

  const derivedDir = reservesPrice?.dir ?? null;

  const beliefPrice =
    beliefPriceRaw && !Number.isNaN(Number(beliefPriceRaw))
      ? Number(beliefPriceRaw)
      : null;

  const price =
    (typeof reservesPrice?.price === "number" && isFinite(reservesPrice.price)
      ? reservesPrice.price
      : null) ??
    (typeof beliefPrice === "number" && isFinite(beliefPrice) ? beliefPrice : null);

  if (!price || !isFinite(price) || !derivedDir) return null;

  const volume = volumeZig(attrs);

  return {
    price,
    volume,
    dir: derivedDir,
    tsMs: Date.now(),
  };
}

type ChartMode = "price" | "mcap";
type ChartUnit = "usd" | "native";
type ChartView = "price" | "marketCap";
type PriceDisplay = ChartUnit;

/* ---------- Datafeed bound to your API + Websocket ---------- */
function makeDatafeed(
  tokenId: string,
  getMode: () => ChartMode,
  getUnit: () => ChartUnit,
  getZigUsd: () => number,
  getSupply: () => number | null,
  getTokenExponent: () => number,
  getContractAddress: () => string | null,
  getPoolId: () => string | null,
  setLivePriceCb: (p: { zig: number; ts: number }) => void,
  enableRealtimeWs = true
) {
  const subs = new Map<
    string,
    {
      onRealtime: (bar: any) => void;
      tf: TfKey;
      onReset?: () => void;
    }
  >();
  const lastTimestamps = new Map<TfKey, number>();
  const lastRealtimeBar = new Map<TfKey, FeedCandle>();
  const lastCloseByTf = new Map<TfKey, number>();
  let ws: WebSocket | null = null;
  let manuallyClosed = false;
  let boundaryTimer: NodeJS.Timeout | null = null;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let reconnectAttempts = 0;

  async function fetchBars(tf: TfKey, fromSec: number, toSec: number) {
    const mode = getMode();
    const unit = getUnit();
    const fromIso = new Date(fromSec * 1000).toISOString();
    const toIso = new Date(toSec * 1000).toISOString();
    const url =
      `${API_BASE}/tokens/${encodeURIComponent(tokenId)}/ohlcv` +
      `?tf=${tf}&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(
        toIso
      )}` +
      `&mode=${mode}&unit=${unit}&priceSource=best&fill=prev`;
    const r = await fetchApi(url, { cache: "no-store" });
    const j = await r.json();
    const data = Array.isArray(j?.data) ? j.data : [];
    return data
      .map((b: any) => ({
        time: Number(b.ts_sec ?? b.ts ?? b.time) * 1000,
        open: Number(b.open),
        high: Number(b.high),
        low: Number(b.low),
        close: Number(b.close),
        volume: Number(b.volume ?? b.volume_native ?? 0),
      }))
      .filter(
        (x: { time: number; open: any; high: any; low: any; close: any }) =>
          isFinite(x.time) &&
          [x.open, x.high, x.low, x.close].every(Number.isFinite)
      )
      .sort((a: { time: number }, b: { time: number }) => a.time - b.time);
  }

  const uniqueTfs = () => Array.from(new Set(Array.from(subs.values()).map((s) => s.tf)));

  const broadcast = (tf: TfKey, bar: FeedCandle) => {
    const matching = Array.from(subs.values()).filter((s) => s.tf === tf);
    matching.forEach((s) => s.onRealtime(bar));
  };

  const closeWs = () => {
    manuallyClosed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    if (boundaryTimer) clearInterval(boundaryTimer);
    boundaryTimer = null;
    try {
      ws?.close();
    } catch {}
    ws = null;
    reconnectAttempts = 0;
  };

  const resetRealtimeState = () => {
    lastTimestamps.clear();
    lastRealtimeBar.clear();
    lastCloseByTf.clear();
  };

  const setLastBar = (tf: TfKey, bar: FeedCandle, emit = true) => {
    lastRealtimeBar.set(tf, bar);
    lastTimestamps.set(tf, bar.time);
    lastCloseByTf.set(tf, bar.close);
    if (emit) broadcast(tf, bar);
  };

  const ensureBoundaryPlaceholders = () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const tfs = uniqueTfs();
    for (const tf of tfs) {
      const step = STEP_SEC[tf];
      const targetBucket = alignFloor(nowSec, step) * 1000;
      const prev = lastRealtimeBar.get(tf);
      if (!prev) continue;
      if (prev.time >= targetBucket) continue;
      const fallbackClose = lastCloseByTf.get(tf) ?? prev.close;
      const placeholder: FeedCandle = {
        time: targetBucket,
        open: fallbackClose,
        high: fallbackClose,
        low: fallbackClose,
        close: fallbackClose,
        volume: 0,
      };
      // keep internal but don't emit
      setLastBar(tf, placeholder, false);
    }
  };

  const scheduleReconnect = () => {
    if (!enableRealtimeWs) return;
    if (manuallyClosed) return;
    if (reconnectAttempts >= 5) return;
    if (reconnectTimer) return;
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
    reconnectAttempts += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectWs();
    }, delay);
  };

  const sendSubs = () => {
    if (!enableRealtimeWs) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const poolId = getPoolId();
    if (!poolId) return;
    const unit = getUnit() === "native" ? "zig" : "usd";
    const baseTf: TfKey = "1m";
    try {
      ws!.send(
        JSON.stringify({
          type: "sub",
          stream: "candles",
          pool_id: String(poolId),
          tf: baseTf,
          unit,
        })
      );
    } catch (e) {
      console.error("WS subscribe failed", e);
    }
  };

  const fillMissingBuckets = (
    tf: TfKey,
    targetBucketMs: number,
    anchorTimeMs: number | null,
    anchorClose: number | null
  ) => {
    if (anchorTimeMs == null || anchorClose == null) return;
    const stepMs = STEP_SEC[tf] * 1000;
    for (let t = anchorTimeMs + stepMs; t < targetBucketMs; t += stepMs) {
      const placeholder: FeedCandle = {
        time: t,
        open: anchorClose,
        high: anchorClose,
        low: anchorClose,
        close: anchorClose,
        volume: 0,
      };
      setLastBar(tf, placeholder, false);
    }
  };

  const pushSwapToSubscribers = (swap: ParsedSwap) => {
    if (!swap) return;
    if (Number.isFinite(swap.price) && swap.price > 0) {
      setLivePriceCb({ zig: swap.price, ts: swap.tsMs });
    }
    const mode = getMode();
    const unit = getUnit();
    const zigUsd = getZigUsd();

    // normalize possible 1e6-scaled price
    const priceInZig =
      Number.isFinite(swap.price) && swap.price > 0
        ? swap.price > 1e4 && swap.price / 1e6 > 0 && swap.price / 1e6 < 1e4
          ? swap.price / 1e6
          : swap.price
        : null;
    if (!priceInZig) return;
    if (unit === "usd" && (!Number.isFinite(zigUsd) || zigUsd <= 0)) return;

    const basePrice = unit === "usd" ? priceInZig * zigUsd : priceInZig;
    const supply = mode === "mcap" ? getSupply() : null;
    const priceRaw =
      mode === "mcap"
        ? supply && supply > 0
          ? basePrice * supply
          : null
        : basePrice;
    if (!priceRaw || !Number.isFinite(priceRaw)) return;

    const normalizeForScale = (p: number, ref?: number | null) => {
      if (!ref || ref <= 0 || !Number.isFinite(ref)) return p;
      const ratio = p / ref;
      if (ratio > 5_000) {
        const scaled = p / 1_000_000;
        const scaledRatio = scaled / ref;
        if (scaled > 0 && scaledRatio > 1e-4 && scaledRatio < 5_000) return scaled;
      }
      if (ratio < 1 / 5_000) {
        const scaled = p * 1_000_000;
        const scaledRatio = scaled / ref;
        if (scaled > 0 && scaledRatio > 1e-4 && scaledRatio < 5_000) return scaled;
      }
      if (ratio > 200 || ratio < 1 / 200) return ref;
      return p;
    };

    const tfs = uniqueTfs();
    if (!tfs.length) return;
    const tsSec = Math.floor(swap.tsMs / 1000);

    for (const tf of tfs) {
      const step = STEP_SEC[tf];
      const bucket = alignFloor(tsSec, step) * 1000;
      const refPrice = lastRealtimeBar.get(tf)?.close ?? lastCloseByTf.get(tf) ?? null;
      const price = normalizeForScale(priceRaw, refPrice);

      // seed first bar
      if (!refPrice) {
        const bar: FeedCandle = {
          time: bucket,
          open: price,
          high: price,
          low: price,
          close: price,
          volume: swap.volume ?? 0,
        };
        setLastBar(tf, bar, true);
        lastCloseByTf.set(tf, price);
        continue;
      }

      if (!price || !Number.isFinite(price)) continue;

      const vol = swap.volume ?? 0;
      const relDiff = Math.abs(price - refPrice) / refPrice;
      if ((vol <= 0 && relDiff > 0.05) || relDiff > 8) continue;

      const prev = lastRealtimeBar.get(tf);
      const fallbackClose = lastCloseByTf.get(tf);
      const anchorTime = prev?.time ?? lastTimestamps.get(tf) ?? null;
      const anchorClose = prev?.close ?? fallbackClose ?? null;
      fillMissingBuckets(tf, bucket, anchorTime, anchorClose);

      const prevAfterFill = lastRealtimeBar.get(tf);
      const baseFallbackClose = lastCloseByTf.get(tf) ?? anchorClose;
      const baseOpen = prevAfterFill?.close ?? baseFallbackClose;
      if (baseOpen == null) continue;

      if (!prevAfterFill || prevAfterFill.time !== bucket) {
        const open = baseOpen;
        const bar: FeedCandle = {
          time: bucket,
          open,
          high: Math.max(open, price),
          low: Math.min(open, price),
          close: price,
          volume: swap.volume ?? 0,
        };
        setLastBar(tf, bar, true);
      } else {
        const updated: FeedCandle = {
          ...prevAfterFill,
          high: Math.max(prevAfterFill.high, price),
          low: Math.min(prevAfterFill.low, price),
          close: price,
          volume: (prevAfterFill.volume || 0) + (swap.volume ?? 0),
        };
        setLastBar(tf, updated, true);
      }
    }
  };

  const handleWsMessage = (ev: MessageEvent) => {
    const parsePayload = async (raw: any) => {
      try {
        if (typeof raw === "string") return JSON.parse(raw);
        if (raw instanceof Blob) return JSON.parse(await raw.text());
        if (raw instanceof ArrayBuffer) return JSON.parse(new TextDecoder().decode(raw));
        return typeof raw === "object" ? raw : null;
      } catch {
        return null;
      }
    };

    (async () => {
      const msg = await parsePayload(ev.data);
      if (!msg) return;
      if (msg?.error) {
        console.debug("WS error payload ignored", msg.error);
        return;
      }
      if (msg?.type === "hello") {
        sendSubs();
        return;
      }
      if (msg?.type !== "candle") return;
      console.debug("Candles WS message:", msg);
      const poolId = getPoolId();
      if (!poolId || String(msg?.pool_id) !== String(poolId)) return;
      const tf = msg?.tf as TfKey | undefined;
      if (!tf || !(tf in STEP_SEC)) return;
      const unit = msg?.unit;
      const expectedUnit = getUnit() === "native" ? "zig" : "usd";
      if (unit && unit !== expectedUnit) return;
      const data = msg?.data || {};
      const bucketStart = data?.bucket_start || msg?.bucket_start;
      const timeMs = bucketStart ? Date.parse(bucketStart) : NaN;
      if (!Number.isFinite(timeMs)) return;
      const open = Number(data?.open);
      const high = Number(data?.high);
      const low = Number(data?.low);
      const close = Number(data?.close);
      if (![open, high, low, close].every(Number.isFinite)) return;

      const volume = Number(data?.volume ?? 0);
      const candle: FeedCandle = {
        time: timeMs,
        open,
        high,
        low,
        close,
        volume: Number.isFinite(volume) ? volume : 0,
      };

      const tsSec = Math.floor(timeMs / 1000);
      const applyCandleToTf = (targetTf: TfKey, base: FeedCandle) => {
        const step = STEP_SEC[targetTf];
        const bucket = alignFloor(tsSec, step) * 1000;
        const prev = lastRealtimeBar.get(targetTf);
        const fallbackClose = lastCloseByTf.get(targetTf);
        const anchorTime = prev?.time ?? lastTimestamps.get(targetTf) ?? null;
        const anchorClose = prev?.close ?? fallbackClose ?? null;
        fillMissingBuckets(targetTf, bucket, anchorTime, anchorClose);

        const current = lastRealtimeBar.get(targetTf);
        if (!current || current.time !== bucket) {
          const openBase =
            current?.close ?? fallbackClose ?? base.open ?? base.close;
          const bar: FeedCandle = {
            time: bucket,
            open: openBase,
            high: Math.max(openBase, base.high),
            low: Math.min(openBase, base.low),
            close: base.close,
            volume: base.volume ?? 0,
          };
          setLastBar(targetTf, bar, true);
          return;
        }

        const updated: FeedCandle = {
          ...current,
          high: Math.max(current.high, base.high),
          low: Math.min(current.low, base.low),
          close: base.close,
          volume: (current.volume || 0) + (base.volume ?? 0),
        };
        setLastBar(targetTf, updated, true);
      };

      if (tf === "1m") {
        applyCandleToTf("1m", candle);
      } else {
        setLastBar(tf, candle, true);
      }

      if (tf === "1m") {
        const tfs = uniqueTfs().filter((t) => t !== "1m");
        for (const targetTf of tfs) {
          applyCandleToTf(targetTf, candle);
        }
      }

      const zigUsd = getZigUsd();
      const zigPrice =
        expectedUnit === "zig"
          ? close
          : zigUsd > 0
          ? close / zigUsd
          : null;
      if (zigPrice && Number.isFinite(zigPrice) && zigPrice > 0) {
        setLivePriceCb({ zig: zigPrice, ts: timeMs });
      }
    })().catch((e) => console.error("ws msg parse", e));
  };

  const connectWs = () => {
    if (!enableRealtimeWs) return;
    if (
      ws &&
      (ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING)
    )
      return;
    manuallyClosed = false;
    try {
      ws = new WebSocket(WS_URL);
      ws.onopen = () => {
        reconnectAttempts = 0;
        sendSubs();
      };
      ws.onmessage = handleWsMessage;
      ws.onclose = () => {
        ws = null;
        scheduleReconnect();
      };
      ws.onerror = () => {
        try {
          ws?.close();
        } catch {}
      };
      if (!boundaryTimer)
        boundaryTimer = setInterval(() => ensureBoundaryPlaceholders(), 5_000);
    } catch (e) {
      console.error("WS connect failed", e);
      scheduleReconnect();
    }
  };

  return {
    onReady: (cb: any) =>
      setTimeout(
        () =>
          cb({
            supports_search: true,
            supports_group_request: false,
            supports_marks: false,
            supports_timescale_marks: false,
            supports_time: true,
            supported_resolutions: ["1", "5", "15", "60", "240", "1D"],
          }),
        0
      ),

    searchSymbols: async (
      userInput: string,
      _exchange: string,
      _symbolType: string,
      onResult: (result: any[]) => void
    ) => {
      try {
        const response = await fetchApi(
          `${API_BASE}/tokens?search=${encodeURIComponent(userInput)}&limit=10`,
          {
            headers: { Accept: "application/json" },
            cache: "no-store",
          }
        );

        if (!response.ok) {
          console.error("Failed to search tokens:", response.statusText);
          return onResult([]);
        }

        const json = await response.json();
        if (!json.success || !Array.isArray(json.data)) {
          return onResult([]);
        }

        const results = json.data.map((token: any) => ({
          symbol: token.denom || token.tokenId,
          full_name: token.name || "Unknown Token",
          description: `${token.name} (${token.symbol || "SYM"})`,
          exchange: "Degenter",
          type: "crypto",
          ticker: token.denom || token.tokenId,
        }));

        onResult(results);
      } catch (error) {
        console.error("Search error:", error);
        onResult([]);
      }
    },

    resolveSymbol: (name: string, done: any) =>
      done({
        name,
        ticker: name,
        description: `${name} · Degenter`,
        type: "crypto",
        session: "24x7",
        exchange: "Degenter",
        listed_exchange: "Degenter",
        timezone: "Etc/UTC",
        has_intraday: true,
        has_daily: true,
        has_weekly_and_monthly: true,
        minmov: 1,
        pricescale: 1e6,
        volume_precision: 2,
        data_status: "streaming",
        supported_resolutions: ["1", "5", "15", "60", "240", "1D"],
        format: "price",
      }),

    getBars: async (
      _info: any,
      resolution: string,
      period: any,
      onHistory: any,
      onError: any
    ) => {
      try {
        const tf = TF_MAP[resolution] ?? "1h";
        const step = STEP_SEC[tf];

        const fromSec = Math.max(0, (period.from | 0) - step);
        const toSec = (period.to | 0) + step;
        const bars = await fetchBars(tf, fromSec, toSec);
        if (!bars.length) return onHistory([], { noData: true });

        const filtered = bars.filter(
          (b: { time: number }) =>
            b.time >= period.from * 1000 && b.time <= period.to * 1000
        );
        const historyPayload = filtered.length ? filtered : bars;

        onHistory(historyPayload, { noData: false });

        // --------- FIXED SEEDING LOGIC ----------
        const nowSec = Math.floor(Date.now() / 1000);
        const stepMs = STEP_SEC[tf] * 1000;
        const currentBucketStart = alignFloor(nowSec, STEP_SEC[tf]) * 1000;

        const anchorCandidate =
          [...historyPayload]
            .reverse()
            .find(
              (b: any) =>
                Number.isFinite(b.time) && b.time <= currentBucketStart
            ) || null;

        const maxGapMs = stepMs * 3;
        const anchorIsFresh =
          anchorCandidate &&
          currentBucketStart - anchorCandidate.time <= maxGapMs;

        if (anchorIsFresh && anchorCandidate) {
          // Seed state with the last bar we actually got from API
          const anchor = {
            time: anchorCandidate.time,
            open: anchorCandidate.open,
            high: anchorCandidate.high,
            low: anchorCandidate.low,
            close: anchorCandidate.close,
            volume: Number(anchorCandidate.volume ?? 0),
          };
          lastRealtimeBar.set(tf, anchor);
          lastTimestamps.set(tf, anchor.time);
          lastCloseByTf.set(tf, anchor.close);

          // Only create a placeholder if API stopped on the *previous* candle.
          // If API already returned the current forming bucket (time === currentBucketStart),
          // we DO NOT overwrite it – WS will keep updating that one.
          if (anchor.time < currentBucketStart) {
            const placeholder = {
              time: currentBucketStart,
              open: anchor.close,
              high: anchor.close,
              low: anchor.close,
              close: anchor.close,
              volume: 0,
            };
            lastRealtimeBar.set(tf, placeholder);
            lastTimestamps.set(tf, placeholder.time);
            lastCloseByTf.set(tf, placeholder.close);
          }
        }
      } catch (e: any) {
        onError?.(e?.message || "getBars failed");
      }
    },

    subscribeBars: (
      _info: any,
      resolution: string,
      onRealtime: any,
      uid: string,
      onResetCacheNeededCallback?: () => void
    ) => {
      const tf = TF_MAP[resolution] ?? "1h";
      subs.set(uid, { onRealtime, tf, onReset: onResetCacheNeededCallback });
      if (enableRealtimeWs) {
        connectWs();
        sendSubs();
      }
    },

    unsubscribeBars: (uid: string) => {
      subs.delete(uid);
      if (subs.size === 0) {
        closeWs();
      }
    },

    getServerTime: (cb: (t: number) => void) =>
      cb(Math.floor(Date.now() / 1000)),
    destroy: () => {
      closeWs();
      subs.clear();
    },
    resubscribe: () => {
      resetRealtimeState();
      sendSubs();
    },
    resetCache: () => {
      resetRealtimeState();
      subs.forEach((s) => s.onReset?.());
      sendSubs();
    },
  };
}

/* ---------- UI / React Component ---------- */

type ViewRangeMode = "recent" | "history";

interface TokenData {
  priceInUsd: number;
  priceInNative: number;
  mc: number;
  mcNative: number;
  change24h: number;
  volume24h: number;
  symbol: string;
  name: string;
  circulatingSupply?: number;
}

function normalizeTokenPayload(raw: any, tokenFallback: string) {
  const token = raw?.token ?? {};
  const price = raw?.price ?? {};
  const priceChange = raw?.priceChange ?? price?.changePct;
  const fallbackSymbol =
    tokenFallback?.split(".").pop()?.toUpperCase() || "TOKEN";
  const fallbackName = tokenFallback?.split(".").pop() || "Token";

  return {
    ...raw,
    token,
    symbol: raw?.symbol ?? token?.symbol ?? fallbackSymbol,
    name: raw?.name ?? token?.name ?? fallbackName,
    imageUri: raw?.imageUri ?? token?.imageUri,
    exponent: raw?.exponent ?? token?.exponent,
    priceInNative: raw?.priceInNative ?? price?.native ?? 0,
    priceInUsd: raw?.priceInUsd ?? price?.usd ?? 0,
    priceChange,
    change24h: raw?.change24h ?? priceChange?.["24h"] ?? 0,
    mc: raw?.mc ?? raw?.mcapDetail?.usd ?? 0,
    mcNative: raw?.mcNative ?? raw?.mcapDetail?.native ?? 0,
    fdv: raw?.fdv ?? raw?.fdvDetail?.usd ?? 0,
    fdvNative: raw?.fdvNative ?? raw?.fdvDetail?.native ?? 0,
    volume24h: raw?.volume24h ?? raw?.volume?.["24h"] ?? 0,
    circulatingSupply: raw?.circulatingSupply ?? raw?.supply?.circulating ?? 0,
    maxSupply: raw?.maxSupply ?? raw?.supply?.max ?? 0,
    holder: raw?.holder ?? raw?.holders ?? 0,
  };
}

interface TradingChartProps {
  token: string;
  denom?: string;
  onToggleAuditPanel?: () => void;
  isAuditPanelVisible?: boolean;
  signerSummary?: SignerFilterSummary | null;
  compact?: boolean;
  realtimeWsEnabled?: boolean;
}

interface ChartDataPoint {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  trades?: number;
}

// Clean numeric values from RPC responses
function cleanNumber(value: string | number): number {
  if (typeof value === "number") return value;
  return parseFloat(String(value).replace(/[^0-9.]/g, ""));
}

// Format price for display
function formatPrice(price: number): string {
  if (!price || !isFinite(price)) return "0.000";
  if (price < 0.001) return price.toFixed(6);
  if (price < 0.01) return price.toFixed(5);
  if (price < 0.1) return price.toFixed(4);
  if (price < 1) return price.toFixed(3);
  return price.toFixed(2);
}

const TF_PRESETS = {
  "1m": { tf: "1m", spanMs: 2 * 24 * 60 * 60 * 1000, stepSec: 60 },
  "5m": { tf: "5m", spanMs: 7 * 24 * 60 * 60 * 1000, stepSec: 300 },
  "15m": { tf: "15m", spanMs: 14 * 24 * 60 * 60 * 1000, stepSec: 900 },
  "1h": { tf: "1h", spanMs: 30 * 24 * 60 * 60 * 1000, stepSec: 3600 },
  "4h": { tf: "4h", spanMs: 120 * 24 * 60 * 60 * 1000, stepSec: 14400 },
  "1d": { tf: "1d", spanMs: 365 * 24 * 60 * 60 * 1000, stepSec: 86400 },
} as const;

export default function TradingChart({
  token,
  denom,
  onToggleAuditPanel,
  signerSummary,
  compact = false,
  realtimeWsEnabled = true,
}: TradingChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);
  const datafeedRef = useRef<{
    destroy?: () => void;
    resubscribe?: () => void;
    resetCache?: () => void;
  } | null>(null);
  const tvShapeIdsRef = useRef<string[]>([]);
  const tvShapeByKeyRef = useRef<Map<string, string>>(new Map());
  const tvBucketCountRef = useRef<Map<string, number>>(new Map());
  const tvLastSettingsRef = useRef<{
    token?: string;
    signer?: string;
    unit?: ChartUnit;
    mode?: ChartMode;
    resolution?: TfKey;
  } | null>(null);

  const [meta, setMeta] = useState<{
    symbol?: string;
    name?: string;
    logo?: string;
    c?: number;
    h?: number;
    l?: number;
    volume?: number;
    changePercent?: number;
  }>({});

  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [currentView, setCurrentView] = useState<ChartView>("price");
  const [priceDisplay, setPriceDisplay] = useState<PriceDisplay>("native");
  const [chartReady, setChartReady] = useState(false);
  const initedRef = useRef(false);
  const [copied, setCopied] = useState<{ type: "url" | "denom"; show: boolean }>({
    type: "url",
    show: false,
  });
  const [activeTf, setActiveTf] = useState<TfKey>("1h");
  const [mode, setMode] = useState<ChartMode>("price");
  const [unit, setUnit] = useState<ChartUnit>("native");
  const [viewMode, setViewMode] = useState<ViewRangeMode>("recent");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contractAddress, setContractAddress] = useState<string | null>(null);
  const [poolId, setPoolId] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<string>("1h");
  const [lastFetched, setLastFetched] = useState<{ [key: string]: number }>({});
  const [livePrice, setLivePrice] = useState<{ zig: number; ts: number } | null>(
    null
  );

  const isStZigToken = useMemo(() => {
    const t = (token || "").toLowerCase();
    return (
      t === "stzig" ||
      t ===
        "coin.zig109f7g2rzl2aqee7z6gffn8kfe9cpqx0mjkk7ethmx8m2hq4xpe9snmaam2.stzig"
    );
  }, [token]);
  const chartTokenKey = token;

  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

  const chartViewOptions = [
    { view: "price" as ChartView, mode: "price" as ChartMode, label: "Price" },
    {
      view: "marketCap" as ChartView,
      mode: "mcap" as ChartMode,
      label: "MCap",
    },
  ];

  const zigUsdRef = useRef(1);
  const supplyRef = useRef<number | null>(null);
  const tokenExponentRef = useRef<number>(6);
  const contractAddressRef = useRef<string | null>(null);
  const poolIdRef = useRef<string | null>(null);
  const modeRef = useRef<ChartMode>(mode);
  const unitRef = useRef<ChartUnit>(unit);

  const getZigUsd = useCallback(() => {
    const v = zigUsdRef.current;
    if (Number.isFinite(v) && v > 0) return v;
    try {
      const stored = Number(localStorage.getItem("priceInZIG") || "0");
      if (Number.isFinite(stored) && stored > 0) {
        zigUsdRef.current = stored;
        return stored;
      }
    } catch {}
    return 1;
  }, []);

  const clearTvShapes = useCallback((chart: any) => {
    if (!tvShapeIdsRef.current.length) return;
    tvShapeIdsRef.current.forEach((id) => {
      try {
        chart.removeEntity?.(id);
      } catch {}
    });
    tvShapeIdsRef.current = [];
    tvShapeByKeyRef.current.clear();
    tvBucketCountRef.current.clear();
  }, []);

  const resolveTvTf = useCallback((chart: any): TfKey => {
    const resRaw = chart?.resolution?.();
    const res =
      typeof resRaw === "string"
        ? resRaw
        : Number.isFinite(resRaw)
        ? String(resRaw)
        : "";
    return TF_MAP[res] ?? "1h";
  }, []);

const applyTvWalletShapes = useCallback(async () => {
  const widget = widgetRef.current;
  if (!widget) return;
  const chart = widget.activeChart?.();
  if (!chart) return;

  if (!signerSummary?.trades?.length) {
    clearTvShapes(chart);
    tvLastSettingsRef.current = null;
    return;
  }
  if (modeRef.current !== "price") return;

  const unit = unitRef.current;
  const zigUsd = getZigUsd();
  const tfKey = resolveTvTf(chart);
  const stepSec = STEP_SEC[tfKey] ?? TF_PRESETS["5m"].stepSec;
  const mode = modeRef.current;

  const settings = {
    token,
    signer: signerSummary.signer,
    unit,
    mode,
    resolution: tfKey,
  };
  const lastSettings = tvLastSettingsRef.current;
  const shouldRebuild =
    !lastSettings ||
    lastSettings.token !== settings.token ||
    lastSettings.signer !== settings.signer ||
    lastSettings.unit !== settings.unit ||
    lastSettings.mode !== settings.mode ||
    lastSettings.resolution !== settings.resolution ||
    signerSummary.trades.length < tvShapeByKeyRef.current.size;

  if (shouldRebuild) {
    clearTvShapes(chart);
  }

  const buildTradeKey = (trade: {
    time: string;
    direction: "buy" | "sell";
    priceInZig: number;
  }) => `${trade.time}-${trade.direction}-${trade.priceInZig}`;

  const pendingTrades = shouldRebuild
    ? signerSummary.trades
    : signerSummary.trades.filter(
        (trade) => !tvShapeByKeyRef.current.has(buildTradeKey(trade))
      );

  if (!pendingTrades.length) {
    tvLastSettingsRef.current = settings;
    return;
  }

  const tradeTimes = pendingTrades
    .map((t) => Math.floor(Date.parse(t.time) / 1000))
    .filter((t) => Number.isFinite(t));

  let candleMap = new Map<number, ChartDataPoint>();
  if (tradeTimes.length) {
    const minSec = Math.min(...tradeTimes) - stepSec;
    const maxSec = Math.max(...tradeTimes) + stepSec;
    try {
      const url =
        `${API_BASE}/tokens/${encodeURIComponent(chartTokenKey)}/ohlcv` +
        `?tf=${TF_PRESETS[tfKey].tf}` +
        `&from=${encodeURIComponent(new Date(minSec * 1000).toISOString())}` +
        `&to=${encodeURIComponent(new Date(maxSec * 1000).toISOString())}` +
        `&mode=${mode}&unit=${unit}&priceSource=best&fill=prev`;
      const res = await fetchApi(url, { cache: "no-store" });
      const json = await res.json();
      const candles = Array.isArray(json?.data) ? json.data : [];
      candleMap = new Map(candles.map((c: any) => [c.ts_sec || c.time, c]));
    } catch {}
  }

  for (const trade of pendingTrades) {
    const tsSec = Math.floor(Date.parse(trade.time) / 1000);
    if (!Number.isFinite(tsSec)) continue;
    const bucketSec = alignFloor(tsSec, stepSec);
    const candle = candleMap.get(bucketSec);

    const basePrice =
      unit === "usd"
        ? trade.priceUsd ??
          (trade.priceInZig > 0 ? trade.priceInZig * zigUsd : 0)
        : trade.priceInZig;

    if (!Number.isFinite(basePrice) || basePrice <= 0) continue;

    const isBuy = trade.direction === "buy";
    const candleTop = candle?.high ?? candle?.close ?? basePrice;
    const candleBottom = candle?.low ?? candle?.close ?? basePrice;
    const referencePrice = isBuy ? candleTop : candleBottom;
    if (!Number.isFinite(referencePrice) || referencePrice <= 0) continue;

    const key = `${bucketSec}-${isBuy ? "B" : "S"}`;
    const offsetIndex = tvBucketCountRef.current.get(key) ?? 0;
    tvBucketCountRef.current.set(key, offsetIndex + 1);

    // Small vertical offset with visible gaps between stacked markers
    const offset = referencePrice * (0.012 + offsetIndex * 0.012);
    const markerPrice = isBuy
      ? referencePrice + offset
      : Math.max(referencePrice - offset, referencePrice * 0.001);

    const themeColor = isBuy ? CANDLE_UP_COLOR : CANDLE_DOWN_COLOR;

    try {
      // Use "icon" shape with custom text for perfect circles
      // Or use "text" with specific overrides to force square aspect ratio
// Alternative: Create a circle shape + text label as separate shapes
// Or use the "signpost" shape which is designed for markers

const markerId = await chart.createShape(
  { time: bucketSec as UTCTimestamp, price: markerPrice },
  {
    shape: "signpost", // Signposts are circular markers with text
    text: isBuy ? "B" : "S",
    lock: true,
    disableSelection: true,
    overrides: {
      color: themeColor,
      backgroundColor: themeColor,
      textColor: "#ffffff",
      fontsize: 10,
      bold: true,
      // Signpost specific overrides
      arrowVisible: false, // Hide the arrow for a clean circle
      fixedSize: true,
      size: 16,
    },
    zOrder: "top",
  }
);

      // Alternative approach if "icon" doesn't work - use "text" with circle emoji or custom styling
      if (!markerId) {
        // Fallback to text shape with specific sizing to maintain circle
        const textMarkerId = await chart.createShape(
          { time: bucketSec as UTCTimestamp, price: markerPrice },
          {
            shape: "text",
            text: isBuy ? "B" : "S",
            lock: true,
            disableSelection: true,
            disableSave: true,
            disableUndo: true,
            overrides: {
              backgroundColor: themeColor,
              backgroundTransparency: 0,
              color: "#ffffff",
              fontsize: 10,
              bold: true,
              borderColor: themeColor,
              borderWidth: 2,
              drawBorder: true,
              fillBackground: true,
              // Critical: fixed size prevents stretching
              fixedSize: true,
              // Force square by using equal padding and no word wrap
              padding: 6, // Equal padding on all sides creates square/circle
              wordWrapWidth: 0,
              // Prevent text from expanding the box
              boxSizing: 'border-box',
              // Size constraints
              minWidth: 20,
              maxWidth: 20,
              minHeight: 20,
              maxHeight: 20,
            },
            zOrder: "top",
          }
        );
        
        if (textMarkerId) {
          const tradeKey = buildTradeKey(trade);
          tvShapeByKeyRef.current.set(tradeKey, textMarkerId);
          tvShapeIdsRef.current.push(textMarkerId);
          const shape = chart.getShapeById?.(textMarkerId);
          if (shape) {
            shape.setUserEditEnabled?.(false);
            shape.setSelectionEnabled?.(false);
            shape.bringToFront?.();
          }
        }
        continue;
      }

      if (markerId) {
        const tradeKey = buildTradeKey(trade);
        tvShapeByKeyRef.current.set(tradeKey, markerId);
        tvShapeIdsRef.current.push(markerId);
        const shape = chart.getShapeById?.(markerId);
        if (shape) {
          shape.setUserEditEnabled?.(false);
          shape.setSelectionEnabled?.(false);
          shape.bringToFront?.();
        }
      }
    } catch (err) {
      console.warn("Failed to create marker:", err);
    }
  }

  tvLastSettingsRef.current = settings;
}, [clearTvShapes, getZigUsd, resolveTvTf, signerSummary, token]);
  const applyTvWalletShapesRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    applyTvWalletShapesRef.current = applyTvWalletShapes;
  }, [applyTvWalletShapes]);


  const getSupply = useCallback(() => {
    const cur = supplyRef.current;
    if (cur != null && Number.isFinite(cur) && cur > 0) return cur;
    try {
      const stored = Number(localStorage.getItem("circulatingSupply") || "0");
      if (Number.isFinite(stored) && stored > 0) {
        supplyRef.current = stored;
        return stored;
      }
    } catch {}
    return null;
  }, []);

  const setZigUsd = (v: number) => {
    if (!Number.isFinite(v) || v <= 0) return;
    zigUsdRef.current = v;
    try {
      localStorage.setItem("priceInZIG", String(v));
    } catch {}
  };

  const fetchZigQuote = useCallback(async () => {
    try {
      const r = await fetchApi(`${API_BASE}/tokens/uzig?priceSource=best`, {
        cache: "no-store",
      });
      const j = await r.json();
      const p =
        Number(j?.data?.priceInUsd) ||
        Number(j?.data?.close) ||
        Number(j?.data?.price?.usd) ||
        0;
      if (Number.isFinite(p) && p > 0) setZigUsd(p);
    } catch (e) {
      console.debug("Unable to refresh ZIG quote", e);
    }
  }, []);

  const getMode = useCallback(() => modeRef.current, []);
  const getUnit = useCallback(() => unitRef.current, []);
  const getTokenExponent = useCallback(
    () => (Number.isFinite(tokenExponentRef.current) ? tokenExponentRef.current : 6),
    []
  );
  const getContractAddress = useCallback(
    () => contractAddressRef.current,
    []
  );
  const getPoolId = useCallback(() => poolIdRef.current, []);

  const fetchTokenData = useCallback(async () => {
    const cacheKey = `token_${token}`;
    const now = Date.now();

    const cachedData = localStorage.getItem(cacheKey);
    const cacheTime = lastFetched[token] || 0;

    if (cachedData && now - cacheTime < CACHE_DURATION) {
      const parsed = normalizeTokenPayload(JSON.parse(cachedData), token);
      tokenExponentRef.current = resolveTokenExponent(parsed);
      setTokenData(parsed);
      const cachedSupply = Number(parsed?.circulatingSupply);
      if (Number.isFinite(cachedSupply) && cachedSupply > 0) {
        supplyRef.current = cachedSupply;
      }
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const apiResponse = await fetchApi(
        `${API_BASE}/tokens/${encodeURIComponent(chartTokenKey)}`
      );
      if (apiResponse.ok) {
        const apiData = await apiResponse.json();
        if (apiData?.success) {
          const normalized = normalizeTokenPayload(apiData.data, token);
          const poolIdValue =
            apiData?.data?.price?.poolId ??
            apiData?.data?.price?.pool_id ??
            apiData?.data?.poolId ??
            apiData?.data?.pool_id ??
            (normalized as any)?.price?.poolId ??
            (normalized as any)?.price?.pool_id ??
            (normalized as any)?.poolId ??
            (normalized as any)?.pool_id ??
            null;
          if (poolIdValue != null && poolIdValue !== "") {
            poolIdRef.current = String(poolIdValue);
            setPoolId(String(poolIdValue));
          }
          localStorage.setItem(cacheKey, JSON.stringify(normalized));
          setLastFetched((prev) => ({ ...prev, [token]: now }));

          if (normalized?.circulatingSupply) {
            const supplyVal = Number(normalized.circulatingSupply);
            if (Number.isFinite(supplyVal) && supplyVal > 0) {
              supplyRef.current = supplyVal;
              localStorage.setItem("circulatingSupply", supplyVal.toString());
            }
          }

          tokenExponentRef.current = resolveTokenExponent(normalized);
          setTokenData(normalized);
          setLoading(false);
          return;
        }
      }

      await fetchFromRPC();
    } catch (err) {
      console.error("Failed to fetch token data:", err);
      setError("Failed to load token data");
      setLoading(false);
    }
  }, [token, lastFetched]);

  const fetchFromRPC = async () => {
    const zigPriceInUsd = parseFloat(localStorage.getItem("priceInZIG") || "0");
    const circSupply = parseFloat(
      localStorage.getItem("circulatingSupply") || "127662647.348331"
    );
    if (Number.isFinite(circSupply) && circSupply > 0) {
      supplyRef.current = circSupply;
    }

    try {
      const rpcResponse = await fetch(
        `https://public-zigchain-testnet-rpc.numia.xyztx_search?query=%22wasm.offer_asset=%27${token}%27+AND+wasm.action=%27swap%27%22&prove=true&page=1&per_page=1&order_by=%22desc%22`
      );
      const rpcData = await rpcResponse.json();

      if (rpcData?.result?.txs?.[0]?.tx_result?.events) {
        const events = rpcData.result.txs[0].tx_result.events;
        const swapEvent = events.find(
          (e: any) =>
            e.type === "wasm" &&
            e.attributes.some(
              (a: any) => a.key === "action" && a.value === "swap"
            )
        );

        if (swapEvent) {
          const returnAmount = parseFloat(
            swapEvent.attributes.find((a: any) => a.key === "return_amount")
              ?.value || "0"
          );
          const offerAmount = parseFloat(
            swapEvent.attributes.find((a: any) => a.key === "offer_amount")
              ?.value || "1"
          );

          const priceInZig = returnAmount / offerAmount;
          const priceInUsd = priceInZig * zigPriceInUsd;

          const newData: TokenData & {
            timeframe?: string;
            historicalData?: any[];
          } = {
            priceInUsd,
            priceInNative: priceInZig,
            mc: priceInUsd * circSupply,
            mcNative: priceInZig * circSupply,
            change24h: 0,
            volume24h: 0,
            symbol: token.split(".").pop()?.toUpperCase() || "TOKEN",
            name: token.split(".").pop() || "Token",
            timeframe,
            historicalData: [],
            circulatingSupply: circSupply,
          };
          tokenExponentRef.current = resolveTokenExponent(newData);

          localStorage.setItem(`token_${token}`, JSON.stringify(newData));
          if (Number.isFinite(circSupply) && circSupply > 0) {
            localStorage.setItem("circulatingSupply", circSupply.toString());
          }
          setLastFetched((prev) => ({ ...prev, [token]: Date.now() }));

          setTokenData(newData);
        }
      }
    } catch (err) {
      console.error("RPC fetch failed:", err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTokenData();

    const interval = setInterval(() => {
      const cacheTime = lastFetched[token] || 0;
      if (Date.now() - cacheTime >= CACHE_DURATION) {
        fetchTokenData();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [token, fetchTokenData]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    unitRef.current = unit;
  }, [unit]);

  useEffect(() => {
    setLivePrice(null);
    headerPrevPriceRef.current = null;
    setHeaderDir("");
  }, [token]);

  useEffect(() => {
    if (!isStZigToken) return;
    setCurrentView("price");
    setMode("price");
    setPriceDisplay("native");
    setUnit("native");
  }, [isStZigToken]);

  // reset contract address on token change
  useEffect(() => {
    setContractAddress(null);
    contractAddressRef.current = null;
    setPoolId(null);
    poolIdRef.current = null;
  }, [token]);

  // fetch pool contract
  useEffect(() => {
    let cancelled = false;
    if (!token) return;
    (async () => {
      try {
        const response = await fetchApi(
          `${API_BASE}/tokens/${encodeURIComponent(
            token
          )}?priceSource=best&includePools=1`,
          { cache: "no-store" }
        );
        if (!response.ok) {
          console.warn(
            "TradingChart pool contract fetch failed",
            response.status
          );
          return;
        }
        const data = await response.json();
        if (data?.success === false) return;
        const detail = data?.data ?? data;
        const tokenPayload = detail?.token ?? detail;
        const pool =
          detail?.poolsDetailed?.[0] ||
          detail?.pools?.[0] ||
          tokenPayload?.poolsDetailed?.[0] ||
          tokenPayload?.pools?.[0];
        if (!pool) return;
        const contractAddr =
          pool?.pair_contract || pool?.pairContract || pool?.contract_address;
        const poolIdValue =
          pool?.pool_id ??
          pool?.poolId ??
          pool?.id ??
          pool?.poolID ??
          pool?.poolIdNumber;
        if (!cancelled) {
          if (contractAddr) {
            contractAddressRef.current = contractAddr;
            setContractAddress(contractAddr);
          }
          if (poolIdValue != null && poolIdValue !== "") {
            poolIdRef.current = String(poolIdValue);
            setPoolId(String(poolIdValue));
          }
        }
      } catch (err) {
        console.error("TradingChart pool contract fetch failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    const native = tokenData?.priceInNative;
    const usd = tokenData?.priceInUsd;
    if (native && usd && isFinite(native) && native > 0 && isFinite(usd) && usd > 0) {
      setZigUsd(usd / native);
    }
  }, [tokenData]);

  useEffect(() => {
    const supply = Number(
      (tokenData as any)?.circulatingSupply ??
        (tokenData as any)?.circulating_supply ??
        0
    );
    const derived =
      (!Number.isFinite(supply) || supply <= 0) &&
      tokenData?.mc &&
      tokenData?.priceInUsd &&
      Number.isFinite(tokenData.priceInUsd) &&
      tokenData.priceInUsd > 0
        ? tokenData.mc / tokenData.priceInUsd
        : null;
    const resolvedSupply =
      Number.isFinite(supply) && supply > 0
        ? supply
        : derived && Number.isFinite(derived) && derived > 0
        ? derived
        : null;
    if (resolvedSupply) {
      supplyRef.current = resolvedSupply;
      try {
        localStorage.setItem("circulatingSupply", String(resolvedSupply));
      } catch {}
    }
  }, [tokenData]);

  useEffect(() => {
    fetchZigQuote();
  }, [fetchZigQuote]);

  const formatDisplayValue = (value: number, isMarketCap = false) => {
    if (isMarketCap) {
      if (currentView === "marketCap") {
        return priceDisplay === "usd"
          ? `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
          : `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${
              tokenData?.symbol || ""
            }`;
      }
      return "";
    }

    if (currentView === "price") {
      return priceDisplay === "usd"
        ? `$${value.toFixed(6)}`
        : `${value.toFixed(6)} ${denom || "ZIG"}`;
    }

    return "";
  };

  useEffect(() => {
    if (!tokenData) return;

    if (currentView === "marketCap") {
      updateChartSeries({
        type: "marketCap",
        value: priceDisplay === "usd" ? tokenData.mc : tokenData.mcNative,
        change24h: tokenData.change24h,
      });
    } else {
      updateChartSeries({
        type: "price",
        value:
          priceDisplay === "usd"
            ? tokenData.priceInUsd
            : tokenData.priceInNative,
        change24h: tokenData.change24h,
      });
    }
  }, [currentView, priceDisplay, tokenData]);

  // ---- TradingView widget init ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadScriptOnce("/charting_library/charting_library.standalone.js");
        await waitForTradingView();

        if (cancelled || !containerRef.current) return;

        const datafeed = makeDatafeed(
          token,
          getMode,
          getUnit,
          getZigUsd,
          getSupply,
          getTokenExponent,
          getContractAddress,
          getPoolId,
          (p) => setLivePrice(p),
          realtimeWsEnabled
        );
        datafeedRef.current = datafeed;

        const TV = (window as any).TradingView;

        const widget = new TV.widget({
          symbol: token,
          interval: "60",
          container: containerRef.current,
          datafeed,
          library_path: "/charting_library/",
          autosize: true,
          theme: "dark",
          locale: "en",
          timezone: "Etc/UTC",
          disabled_features: ["use_localstorage_for_settings"],
          enabled_features: ["study_templates"],
        });

        widgetRef.current = widget;

        widget.onChartReady?.(() => {
          if (cancelled) return;
          void applyTvWalletShapesRef.current();
        });

        try {
          const r = await fetchApi(
            `${API_BASE}/tokens/${encodeURIComponent(chartTokenKey)}?priceSource=best`,
            { cache: "no-store" }
          );
          const j = await r.json();
          if (!cancelled && j?.success && j?.data) {
            const normalized = normalizeTokenPayload(j.data, token);
            setMeta({
              symbol: normalized.symbol,
              name: normalized.name,
              logo: normalized.imageUri,
              c: normalized.close,
              h: normalized.high,
              l: normalized.low,
              volume: normalized.volume,
              changePercent: normalized.changePercent,
            });
          }
        } catch {}
      } catch (e) {
        console.error("TV init failed:", e);
      }
    })();

    return () => {
      cancelled = true;
      try {
        widgetRef.current?.remove?.();
      } catch {}
      widgetRef.current = null;
      try {
        datafeedRef.current?.destroy?.();
      } catch {}
      datafeedRef.current = null;
    };
  }, [token, getMode, getUnit, getZigUsd, getSupply, getTokenExponent, getContractAddress, getPoolId]);

  useEffect(() => {
    void applyTvWalletShapesRef.current();
  }, [applyTvWalletShapes, mode, unit, signerSummary, token]);

  useEffect(() => {
    datafeedRef.current?.resetCache?.();
    try {
      widgetRef.current?.activeChart?.().resetData?.();
    } catch {}
  }, [unit, mode, poolId, activeTf]);

  // ---- extra lightweight-charts header stuff (kept as in your file) ----
  const chartHostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const sRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const vRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  const [live, setLive] = useState(false);
  const [hdr, setHdr] = useState({
    h: 0,
    l: 0,
    c: 0,
    volume: 0,
    changePercent: 0,
  });
  const [priceDir, setPriceDir] = useState<"high" | "low" | "">("");
  const [headerDir, setHeaderDir] = useState<"" | "up" | "down">("");
  const lastPriceRef = useRef<number | null>(null);
  const headerPrevPriceRef = useRef<number | null>(null);

  const barsRef = useRef<ChartDataPoint[]>([]);
  const walletMarkersRef = useRef<SeriesMarker<Time>[]>([]);
  const oldestSecRef = useRef<number | null>(null);
  const newestSecRef = useRef<number | null>(null);
  const stepSecRef = useRef<number>(TF_PRESETS["1h"].stepSec);
  const genesisSecRef = useRef<number | null>(null);
  const historyLockCeilRef = useRef<number | null>(null);

  const BACKFILL_BATCH_BARS = 600;
  const BACKFILL_TRIGGER_BARS = 20;
  const backfillingRef = useRef(false);

  const tz = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    []
  );
  const tickLabel = (sec: number) =>
    new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "short",
    }).format(new Date(sec * 1000));

  const iso = (ms: number) => new Date(ms).toISOString();

  const toUtcBucket = (x: any): UTCTimestamp => {
    if (typeof x === "number")
      return (x > 1e12 ? Math.floor(x / 1000) : Math.floor(x)) as UTCTimestamp;
    return Math.floor(Date.parse(String(x)) / 1000) as UTCTimestamp;
  };

  const precisionFor = (p: number) => {
    if (!isFinite(p) || p <= 0) return 2;
    if (p >= 1) return 2;
    if (p >= 0.1) return 4;
    if (p >= 0.01) return 5;
    if (p >= 0.001) return 6;
    if (p >= 0.0001) return 8;
    return 10;
  };

  const alignFloorSec = (tsSec: number, stepSec: number) =>
    Math.floor(tsSec / stepSec) * stepSec;
  const bucketRange = (fromSec: number, toSec: number, stepSec: number) => {
    const start = Math.floor(fromSec / stepSec) * stepSec;
    const end = Math.floor(toSec / stepSec) * stepSec;
    return { start, end };
  };

  const toCandle = (d: ChartDataPoint): CandlestickData => {
    const up = d.close >= d.open;
    const col = up ? CANDLE_UP_COLOR : CANDLE_DOWN_COLOR;
    return {
      time: d.time as Time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
      color: col,
      borderColor: col,
      wickColor: col,
    };
  };
  const toVol = (d: ChartDataPoint): HistogramData => ({
    time: d.time as Time,
    value: Number(d.volume || 0),
    color: d.close >= d.open ? CANDLE_UP_COLOR : CANDLE_DOWN_COLOR,
  });

  const buildWalletMarkers = useCallback(
    (summary: SignerFilterSummary | null | undefined) => {
      if (!summary?.trades?.length) return [];
      const stepSec = stepSecRef.current || TF_PRESETS[activeTf].stepSec;
      const bucketMap = new Map<number, { buy: number; sell: number }>();
      
      // Group trades by bucket
      summary.trades.forEach((trade) => {
        const tsSec = Math.floor(Date.parse(trade.time) / 1000);
        if (!Number.isFinite(tsSec)) return;
        const bucket = alignFloorSec(tsSec, stepSec);
        const current = bucketMap.get(bucket) || { buy: 0, sell: 0 };
        if (trade.direction === "buy") {
          current.buy++;
        } else {
          current.sell++;
        }
        bucketMap.set(bucket, current);
      });

      const markers: SeriesMarker<Time>[] = [];
      bucketMap.forEach((counts, bucket) => {
        if (counts.buy > 0) {
          markers.push({
            time: (bucket - 2) as Time,
            position: "belowBar",
            color: CANDLE_UP_COLOR,
            backgroundColor: CANDLE_UP_COLOR,
            textColor: "#ffffff",
            shape: "circle",
            text: counts.buy > 1 ? `B${counts.buy}` : "B",
          } as SeriesMarker<Time>);
        }
        if (counts.sell > 0) {
          markers.push({
            time: (bucket + 2) as Time,
            position: "aboveBar",
            color: CANDLE_DOWN_COLOR,
            backgroundColor: CANDLE_DOWN_COLOR,
            textColor: "#ffffff",
            shape: "circle",
            text: counts.sell > 1 ? `S${counts.sell}` : "S",
          } as SeriesMarker<Time>);
        }
      });
      return markers;
    },
    [activeTf]
  );

  const applyWalletMarkers = useCallback(() => {
    if (!sRef.current) return;
    if (!signerSummary?.trades?.length) {
      if (walletMarkersRef.current.length) {
        walletMarkersRef.current = [];
        sRef.current.setMarkers([]);
      }
      return;
    }
    const markers = buildWalletMarkers(signerSummary);
    walletMarkersRef.current = markers;
    sRef.current.setMarkers(markers);
  }, [buildWalletMarkers, signerSummary]);

  useEffect(() => {
    if (!chartReady) return;
    applyWalletMarkers();
  }, [chartReady, applyWalletMarkers, token]);

  const parsePayload = (payload: any): ChartDataPoint[] => {
    const raw = payload?.data || [];
    return (raw as any[])
      .map((b: any) => ({
        time: toUtcBucket(
          b.ts_sec ?? b.ts ?? b.time ?? b.bucket_ts ?? b.bucket
        ),
        open: Number(b.open),
        high: Number(b.high),
        low: Number(b.low),
        close: Number(b.close),
        volume: Number(b.volume ?? b.volume_native ?? 0),
        trades: Number(b.trades ?? 0),
      }))
      .filter(
        (x: any) =>
          x.time && [x.open, x.high, x.low, x.close].every(Number.isFinite)
      )
      .sort((a: any, b: any) => a.time - b.time);
  };

  const cb = () => `_t=${Date.now()}`;

  const buildUrl = (tf: string, fromMs: number, toMs: number) => {
    const lock = historyLockCeilRef.current;
    const lockMs = lock ? Math.max(fromMs, lock * 1000) : fromMs;
    return (
      `${API_BASE}/tokens/${encodeURIComponent(chartTokenKey)}/ohlcv` +
      `?tf=${tf}&from=${encodeURIComponent(
        iso(lockMs)
      )}&to=${encodeURIComponent(iso(toMs))}` +
      `&mode=${mode}&unit=${unit}&priceSource=best&fill=prev&${cb()}`
    );
  };

  // init lightweight chart (for header / extras)
  useEffect(() => {
    const host = chartHostRef.current;
    if (!host || initedRef.current) return;
    initedRef.current = true;

    const chart = createChart(host, {
      width: host.clientWidth || 600,
      height: host.clientHeight || 400,
      layout: {
        background: { type: ColorType.Solid, color: "#000" },
        textColor: "#c8d1dc",
        fontSize: 12,
      },
      grid: {
        vertLines: { color: "rgba(200,209,220,0.05)" },
        horzLines: { color: "rgba(200,209,220,0.05)" },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.25, bottom: 0.2 },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 2,
        barSpacing: 8,
        fixLeftEdge: true,
        lockVisibleTimeRangeOnResize: true,
        tickMarkFormatter: (t: number) => tickLabel(Number(t)),
      },
      crosshair: { mode: CrosshairMode.Normal },
    });

    const s = chart.addCandlestickSeries({
      upColor: CANDLE_UP_COLOR,
      downColor: CANDLE_DOWN_COLOR,
      wickUpColor: CANDLE_UP_COLOR,
      wickDownColor: CANDLE_DOWN_COLOR,
      borderVisible: false,
      priceFormat: { type: "price", precision: 4, minMove: 0.0001 },
    });
    const v = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });
    chart
      .priceScale("")
      .applyOptions({ scaleMargins: { top: 0.9, bottom: 0 } });

    chart.timeScale().subscribeVisibleTimeRangeChange((range) => {
      if (!range?.from || !oldestSecRef.current || !chartRef.current) return;
      const from = range.from as number;
      const step = stepSecRef.current;
      if (
        from - (oldestSecRef.current as number) <
        step * BACKFILL_TRIGGER_BARS
      )
        void backfillOlder();
      if (from < (oldestSecRef.current as number))
        chart.timeScale().setVisibleRange({
          from: oldestSecRef.current as Time,
          to: range.to as Time,
        });
    });

    const ro = new ResizeObserver(() => {
      if (!chartHostRef.current) return;
      chart.applyOptions({
        width: Math.max(320, chartHostRef.current.clientWidth),
        height: Math.max(260, chartHostRef.current.clientHeight),
      });
    });
    ro.observe(host);

    chartRef.current = chart;
    sRef.current = s;
    vRef.current = v;
    setChartReady(true);

    return () => {
      ro.disconnect();
      try {
        chart.remove();
      } catch {}
      chartRef.current = null;
      sRef.current = null;
      vRef.current = null;
      initedRef.current = false;
      setChartReady(false);
    };
  }, []);

  const ensureGenesis = async () => {
    if (genesisSecRef.current) return genesisSecRef.current;
    try {
      const url =
        `${API_BASE}/tokens/${encodeURIComponent(chartTokenKey)}/ohlcv?tf=1h` +
        `&from=${encodeURIComponent("1970-01-01T00:00:00.000Z")}` +
        `&to=${encodeURIComponent(iso(Date.now()))}` +
        `&mode=${mode}&unit=${unit}&priceSource=best&fill=none&${cb()}`;
      const res = await fetchApi(url, { cache: "no-store" });
      const json = await res.json();
      const bars = parsePayload(json);
      genesisSecRef.current = (
        bars.length ? bars[0].time : Math.floor(Date.now() / 1000)
      ) as number;
    } catch {
      genesisSecRef.current = Math.floor(
        (Date.now() - 365 * 24 * 3600 * 1000) / 1000
      );
    }
    return genesisSecRef.current!;
  };

  const fetchAnchorBefore = async (
    tf: string,
    beforeSec: number
  ): Promise<ChartDataPoint | null> => {
    try {
      const toMsExclusive = beforeSec * 1000 - 1;
      const url =
        `${API_BASE}/tokens/${encodeURIComponent(chartTokenKey)}/ohlcv` +
        `?tf=${tf}&window=1&to=${encodeURIComponent(iso(toMsExclusive))}` +
        `&mode=${mode}&unit=${unit}&priceSource=best&fill=prev&${cb()}`;
      const res = await fetchApi(url, { cache: "no-store" });
      const json = await res.json();
      const arr = parsePayload(json);
      return arr.length ? arr[0] : null;
    } catch {
      return null;
    }
  };

  const precisionForHeader = (p: number) => {
    const prec = precisionFor(p);
    return { str: p.toFixed(prec), prec };
  };

  const upsertByTime = (bar: ChartDataPoint) => {
    const lock = historyLockCeilRef.current;
    if (lock != null && bar.time <= lock) {
      const idxLocked = barsRef.current.findIndex((b) => b.time === bar.time);
      if (idxLocked === -1) return;
    }

    const cur = barsRef.current;
    const idx = cur.findIndex((b) => b.time === bar.time);
    if (idx >= 0) cur[idx] = bar;
    else {
      let lo = 0,
        hi = cur.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cur[mid].time < bar.time) lo = mid + 1;
        else hi = mid;
      }
      cur.splice(lo, 0, bar);
    }
    sRef.current?.setData(cur.map(toCandle));
    vRef.current?.setData(cur.map(toVol));
    applyWalletMarkers();
    newestSecRef.current = cur.at(-1)?.time ?? bar.time;
    const prev = lastPriceRef.current;
    if (prev != null)
      setPriceDir(bar.close > prev ? "high" : bar.close < prev ? "low" : "");
    lastPriceRef.current = bar.close;
    setHdr((h) => ({
      ...h,
      h: bar.high,
      l: bar.low,
      c: bar.close,
      volume: bar.volume ?? 0,
    }));
  };

  const loadCandles = async () => {
    if (!sRef.current || !vRef.current) return;
    try {
      setLoading(true);
      setError(null);
      const cfg = TF_PRESETS[activeTf];
      stepSecRef.current = cfg.stepSec;

      const nowSec = Math.floor(Date.now() / 1000);
      const genesisSec =
        viewMode === "history"
          ? await ensureGenesis()
          : Math.floor((Date.now() - cfg.spanMs) / 1000);
      const { start, end } = bucketRange(genesisSec, nowSec, cfg.stepSec);

      const initUrl =
        `${API_BASE}/tokens/${encodeURIComponent(chartTokenKey)}/ohlcv` +
        `?tf=${cfg.tf}&from=${encodeURIComponent(
          iso(start * 1000)
        )}&to=${encodeURIComponent(iso(nowSec * 1000))}` +
        `&mode=${mode}&unit=${unit}&priceSource=best&fill=prev&${cb()}`;
      const res = await fetchApi(initUrl, { cache: "no-store" });
      const json = await res.json();
      let parsed = parsePayload(json);

      const cap = end as UTCTimestamp;
      const out: ChartDataPoint[] = [];

      parsed = parsed.filter((b) => b.time <= cap);
      const byTs = new Map(parsed.map((b) => [b.time, b]));
      let last: ChartDataPoint | null = null;
      for (let t = start; t <= cap; t += cfg.stepSec) {
        const real = byTs.get(t as UTCTimestamp);
        if (real) {
          out.push(real);
          last = real;
        } else if (last)
          out.push({
            time: t as UTCTimestamp,
            open: last.close,
            high: last.close,
            low: last.close,
            close: last.close,
            volume: 0,
            trades: 0,
          });
      }

      historyLockCeilRef.current = out.at(-1)?.time ?? cap;

      const nowBucketStart = alignFloorSec(nowSec, cfg.stepSec) as UTCTimestamp;
      if (out.length && out[out.length - 1].time < nowBucketStart) {
        const base = out[out.length - 1];
        out.push({
          time: nowBucketStart,
          open: base.close,
          high: base.close,
          low: base.close,
          close: base.close,
          volume: 0,
          trades: 0,
        });
      }

      barsRef.current = out;
      oldestSecRef.current = out[0]?.time ?? start;
      newestSecRef.current = out.at(-1)?.time ?? cap;

      const lastReal =
        [...out]
          .reverse()
          .find((b) => (b.volume ?? 0) > 0 || b.high !== b.low) ??
        out.at(-1) ??
        null;
      if (lastReal) {
        const changePct =
          out[0]?.open > 0
            ? ((lastReal.close - out[0].open) / out[0].open) * 100
            : 0;
        const { prec } = precisionForHeader(lastReal.close);
        setHdr({
          h: lastReal.high,
          l: lastReal.low,
          c: lastReal.close,
          volume: Number(lastReal.volume || 0),
          changePercent: changePct,
        });
        sRef.current.applyOptions({
          priceFormat: {
            type: "price",
            precision: prec,
            minMove: Number(`1e-${prec}`),
          },
        });
      } else setHdr({ h: 0, l: 0, c: 0, volume: 0, changePercent: 0 });

      sRef.current.setData(out.map(toCandle));
      vRef.current.setData(out.map(toVol));
      applyWalletMarkers();

      if (out.length && chartRef.current) {
        if (viewMode === "history")
          chartRef.current
            .timeScale()
            .setVisibleRange({ from: out[0].time, to: out.at(-1)!.time });
        else {
          const count = out.length;
          const visibleBars = Math.min(100, count);
          chartRef.current.timeScale().setVisibleRange({
            from: out[Math.max(0, count - visibleBars)].time,
            to: out[count - 1].time,
          });
        }
      }
    } catch {
      setError("Failed to load chart data");
    } finally {
      setLoading(false);
    }
  };

  const backfillOlder = async () => {
    if (!sRef.current || backfillingRef.current) return;
    const cfg = TF_PRESETS[activeTf];
    const step = cfg.stepSec;
    const oldest = oldestSecRef.current ?? null;
    if (!oldest) return;
    backfillingRef.current = true;
    try {
      const genesis = await ensureGenesis();
      if (oldest <= genesis) return;
      const toSec = oldest - step;
      const fromSec = Math.max(genesis, toSec - BACKFILL_BATCH_BARS * step);
      const res = await fetchApi(
        `${API_BASE}/tokens/${encodeURIComponent(chartTokenKey)}/ohlcv?tf=${cfg.tf}` +
          `&from=${encodeURIComponent(
            iso(fromSec * 1000)
          )}&to=${encodeURIComponent(iso(toSec * 1000))}` +
          `&mode=${mode}&unit=${unit}&priceSource=best&fill=prev&${cb()}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      const older = parsePayload(json).filter(
        (b) => b.time < (oldest as UTCTimestamp)
      );
      if (!older.length) return;

      const merged = [...older, ...barsRef.current];
      barsRef.current = merged;
      oldestSecRef.current = merged[0].time;

      const lastReal =
        [...merged]
          .reverse()
          .find((b) => (b.volume ?? 0) > 0 || b.high !== b.low) ??
        merged.at(-1)!;
      const prec = precisionFor(lastReal.close);
      sRef.current?.applyOptions({
        priceFormat: {
          type: "price",
          precision: prec,
          minMove: Number(`1e-${prec}`),
        },
      });

      sRef.current?.setData(merged.map(toCandle));
      vRef.current?.setData(merged.map(toVol));
      applyWalletMarkers();
      if (chartRef.current) {
        const vis = chartRef.current.timeScale().getVisibleRange();
        if (vis?.to)
          chartRef.current
            .timeScale()
            .setVisibleRange({ from: merged[0].time, to: vis.to });
        else chartRef.current.timeScale().fitContent();
      }
    } catch (e) {
      console.warn("backfillOlder failed", e);
    } finally {
      backfillingRef.current = false;
    }
  };

  const lastTradeIsoRef = useRef<string | null>(null);
  const burstUntilRef = useRef<number>(0);
  const baseSlowMs = 7000;
  const maxSlowMs = 12000;
  const fastMsMin = 800;
  const fastMsMax = 1200;
  const quickRetryRef = useRef({ tries: 0, max: 4 });
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    burstUntilRef.current = Date.now() + 90_000;
  }, [token]);

  const jitter = (min: number, max: number) =>
    min + Math.floor(Math.random() * (max - min + 1));
  const msToNextBoundary = (stepSec: number) => {
    const now = Date.now();
    const stepMs = stepSec * 1000;
    return stepMs - (now % stepMs);
  };

  const nextIntervalMs = () => {
    const now = Date.now();
    const tfStep = TF_PRESETS[activeTf].stepSec;
    const to1m = msToNextBoundary(60);
    const toTf = msToNextBoundary(tfStep);
    if (now < burstUntilRef.current) return jitter(fastMsMin, fastMsMax);
    if (to1m <= 20_000 || toTf <= 20_000)
      return Math.min(jitter(900, 1300), Math.min(to1m, toTf));
    return jitter(baseSlowMs, maxSlowMs);
  };

  const probeHasNewTrades = async (): Promise<boolean> => {
    try {
      const url = `${API_BASE}/trades/recent?tokenId=${encodeURIComponent(
        token
      )}&limit=1&${cb()}`;
      const res = await fetchApi(url, { cache: "no-store" });
      const json = await res.json();
      const t = json?.data?.[0]?.time as string | undefined;
      if (!t) return false;
      if (lastTradeIsoRef.current && t <= lastTradeIsoRef.current) return false;
      lastTradeIsoRef.current = t;
      return true;
    } catch {
      return false;
    }
  };

  const synthesizeFormingFrom1m = async (
    nowSec: number
  ): Promise<"ok" | "empty"> => {
    const stepSec = TF_PRESETS[activeTf].stepSec;
    const bucketStart = alignFloorSec(nowSec, stepSec);

    const prevCloseUrl = buildUrl(
      "1m",
      bucketStart * 1000,
      (bucketStart + stepSec - 1) * 1000
    );
    const res = await fetchApi(prevCloseUrl, { cache: "no-store" });
    const json = await res.json();
    const mins = parsePayload(json).filter(
      (b) => b.time >= (bucketStart as UTCTimestamp)
    );

    const lock = historyLockCeilRef.current ?? bucketStart;
    if (!barsRef.current.length) {
      const prev = mins[0]?.open ?? null;
      if (prev != null) {
        const preTime = (bucketStart - stepSec) as UTCTimestamp;
        if (preTime >= lock) {
          const pre = {
            time: preTime,
            open: prev,
            high: prev,
            low: prev,
            close: prev,
            volume: 0,
            trades: 0,
          };
          upsertByTime(pre);
          oldestSecRef.current = pre.time;
          newestSecRef.current = pre.time;
        }
      }
    }

    const prevClose = barsRef.current.at(-1)?.close ?? mins[0]?.open ?? null;

    if (!mins.length) {
      if (prevClose == null) return "empty";
      const open = prevClose;
      upsertByTime({
        time: bucketStart as UTCTimestamp,
        open,
        high: open,
        low: open,
        close: open,
        volume: 0,
        trades: 0,
      });
      await reconcileRecent(nowSec, 3);
      return "empty";
    }

    const first = mins[0];
    const last = mins[mins.length - 1];
    const open =
      prevClose != null
        ? first.time === (bucketStart as UTCTimestamp)
          ? first.open
          : prevClose
        : first.open;

    const highs = [open, ...mins.map((m) => m.high)];
    const lows = [open, ...mins.map((m) => m.low)];

    const bar: ChartDataPoint = {
      time: bucketStart as UTCTimestamp,
      open,
      high: Math.max(...highs),
      low: Math.min(...lows),
      close: last.close,
      volume: mins.reduce((s, m) => s + (m.volume || 0), 0),
      trades: mins.reduce((s, m) => s + (m.trades || 0), 0),
    };

    upsertByTime(bar);
    await reconcileRecent(nowSec, 3);
    return "ok";
  };

  const reconcileRecent = async (nowSec: number, n = 3) => {
    try {
      const step = TF_PRESETS[activeTf].stepSec;
      const tf = TF_PRESETS[activeTf].tf;

      const lastClosedStart = alignFloorSec(nowSec, step);
      const toSecExclusive = lastClosedStart + step - 1;

      const url =
        `${API_BASE}/tokens/${encodeURIComponent(chartTokenKey)}/ohlcv` +
        `?tf=${tf}&window=${n + 1}&to=${encodeURIComponent(
          iso(toSecExclusive * 1000)
        )}` +
        `&mode=${mode}&unit=${unit}&priceSource=best&fill=prev&${cb()}`;

      const res = await fetchApi(url, { cache: "no-store" });
      const json = await res.json();
      const tailAll = parsePayload(json);
      if (!tailAll.length) return;
      const tail = tailAll.slice(-n);

      const lock = historyLockCeilRef.current ?? 0;
      for (const bar of tail) if (bar.time >= lock) upsertByTime(bar);
    } catch {}
  };

  useEffect(() => {
    if (!token || !chartReady) return;
    let stopped = false;
    const schedule = (ms: number) => {
      if (stopped) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(tick, ms);
    };

    const tick = async () => {
      if (stopped) return;
      if (document.hidden) {
        schedule(7000);
        setLive(false);
        quickRetryRef.current.tries = 0;
        return;
      }

      const hadNew = await probeHasNewTrades();
      const nowSec = Math.floor(Date.now() / 1000);

      if (hadNew) {
        burstUntilRef.current = Math.max(
          burstUntilRef.current,
          Date.now() + 60_000
        );
        setLive(true);

        const status = await synthesizeFormingFrom1m(nowSec);

        if (status === "empty") {
          const q = quickRetryRef.current;
          if (q.tries < q.max) {
            q.tries += 1;
            schedule(Math.min(800, 350 + Math.random() * 450));
            return;
          }
          q.tries = 0;
        } else quickRetryRef.current.tries = 0;
      } else {
        setLive(false);
        quickRetryRef.current.tries = 0;
      }

      schedule(nextIntervalMs());
    };

    schedule(900);
    return () => {
      stopped = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [token, activeTf, mode, unit, chartReady, viewMode]);

  const currentPriceVal = useMemo(() => {
    if (!tokenData) return null;

    const supply = supplyRef.current || tokenData.circulatingSupply || null;
    const zigLive = livePrice?.zig;
    const liveBase =
      zigLive && Number.isFinite(zigLive)
        ? priceDisplay === "usd"
          ? zigLive * getZigUsd()
          : zigLive
        : null;

    if (currentView === "marketCap") {
      const base =
        liveBase && supply ? liveBase * supply : priceDisplay === "usd"
        ? tokenData.mc
        : tokenData.mcNative;
      return Number.isFinite(base) ? base : null;
    }

    return liveBase ??
      (priceDisplay === "usd" ? tokenData.priceInUsd : tokenData.priceInNative);
  }, [tokenData, livePrice, priceDisplay, getZigUsd, currentView]);

  useEffect(() => {
    if (currentPriceVal == null) return;
    const prev = headerPrevPriceRef.current;
    if (prev != null) {
      if (currentPriceVal > prev) setHeaderDir("up");
      else if (currentPriceVal < prev) setHeaderDir("down");
      else setHeaderDir("");
    }
    headerPrevPriceRef.current = currentPriceVal;
  }, [currentPriceVal]);

  const formatCompact = (n: number) => {
    if (!Number.isFinite(n)) return "N/A";
    const abs = Math.abs(n);
    const div = (d: number) => (n / d).toFixed(2);
    if (abs >= 1e12) return `${div(1e12)}T`;
    if (abs >= 1e9) return `${div(1e9)}B`;
    if (abs >= 1e6) return `${div(1e6)}M`;
    if (abs >= 1e3) return `${div(1e3)}K`;
    return n.toFixed(n < 1 ? 6 : 2);
  };

  const priceParts = useMemo(() => {
    if (currentPriceVal == null) return null;
    if (currentView === "marketCap") {
      const prefix = priceDisplay === "usd" ? "$" : "";
      const suffix = priceDisplay === "usd" ? "" : ` ${denom || "ZIG"}`;
      return { compact: `${prefix}${formatCompact(currentPriceVal)}${suffix}` };
    }
    const numeric = currentPriceVal.toFixed(6);
    const prefixSymbol = priceDisplay === "usd" ? "$" : "";
    const suffix = priceDisplay === "usd" ? "" : ` ${denom || "ZIG"}`;
    return {
      prefix: `${prefixSymbol}${numeric.slice(0, -1)}`,
      last: numeric.slice(-1),
      suffix,
    };
  }, [currentPriceVal, priceDisplay, denom, currentView, formatCompact]);

  const formatChange = (c: number) => `${c >= 0 ? "+" : ""}${c.toFixed(2)}%`;

  const copyToClipboard = async (type: "url" | "denom") => {
    try {
      const text = type === "url" ? window.location.href : token;
      await navigator.clipboard.writeText(text);
      setCopied({ type, show: true });
      const timer = setTimeout(() => {
        setCopied((prev) => ({ ...prev, show: false }));
      }, 2000);
      return () => clearTimeout(timer);
    } catch (err) {
      console.error(`Failed to copy ${type}:`, err);
    }
  };

  const updateChartSeries = (data: {
    type: "price" | "marketCap";
    value: number;
    change24h: number;
  }) => {
    // placeholder for any extra series logic
  };

  /* ---------- UI ---------- */
  return (
    <div className="flex h-full min-h-0 w-full max-w-full flex-col rounded-lg border border-[#808080]/20 bg-black/30 backdrop-blur-sm">
      <div
        className={`relative flex items-start justify-between border-b border-transparent ${
          compact ? "px-2 py-1.5 md:items-start" : "px-4 py-2 md:items-center"
        }`}
      >
        <div className="absolute bottom-0 left-4 right-4 h-[1px] bg-gradient-to-r from-[#39C8A6] via-[#FA4E30] to-[#2D1B45]" />
        <div
          className={`flex w-full flex-wrap items-start gap-3 ${
            compact ? "" : "md:w-auto md:items-center"
          }`}
        >
          {meta.logo ? (
            <img
              src={meta.logo}
              alt={meta.symbol || token}
              className="w-8 h-8 md:w-10 md:h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white/10" />
          )}
          <div className="flex flex-col">
            <span className="text-[#F1F5F9] font-semibold text-[1.1rem] leading-tight">
              {meta.symbol}
            </span>
            <span className="text-gray-400 text-[0.8rem] -mt-[2px]">
              {meta.name || "Token"}
            </span>
          </div>

          <div
            className={`items-baseline gap-2 ${
              compact ? "hidden" : "mt-1 hidden w-full md:flex md:w-auto md:items-center md:mt-0"
            }`}
          >
            <div
              className={`text-white text-[1.7rem] sm:text-[2rem] md:text-[2.4rem] font-medium transition-colors duration-300`}
            >
              <div className="min-w-[180px] flex-shrink-0">
                {loading ? (
                  <div className="h-8 w-32 bg-gray-700 rounded animate-pulse"></div>
                ) : error ? (
                  <span className="text-red-400">Error loading data</span>
                ) : tokenData ? (
                  <div className="flex flex-col">
                    {currentView === "marketCap" ? (
                      <div className="text-2xl sm:text-3xl font-bold text-white">
                        {priceParts?.compact ?? "N/A"}
                      </div>
                    ) : (
                      <div className="text-2xl sm:text-3xl font-bold text-white">
                        <span>{(priceParts as any)?.prefix ?? ""}</span>
                        <span
                          className={
                            headerDir === "up"
                              ? "text-white"
                              : headerDir === "down"
                              ? "text-white"
                              : "text-white"
                          }
                        >
                          {(priceParts as any)?.last ?? ""}
                        </span>
                        <span>{(priceParts as any)?.suffix ?? ""}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-8 w-32">N/A</div>
                )}
              </div>
            </div>
          </div>

          <div
            className={`flex flex-wrap items-center text-xs sm:text-sm ${
              compact ? "gap-1.5" : "gap-2 sm:gap-3"
            }`}
          >
            <div className="flex items-center gap-1 bg-[#242424]/50 rounded px-1 py-1">
              {chartViewOptions.map(({ view, mode: viewMode, label }) => (
                <button
                  key={view}
                  onClick={() => {
                    if (isStZigToken && view === "marketCap") return;
                    setCurrentView(view);
                    setMode(viewMode);
                  }}
                  disabled={isStZigToken && view === "marketCap"}
                  className={`px-2 py-0.5 rounded text-xs ${
                    currentView === view
                      ? "border border-yellow-300 text-yellow-200"
                      : "text-white/90 hover:text-white"
                  } ${
                    isStZigToken && view === "marketCap"
                      ? "opacity-50 cursor-not-allowed"
                      : ""
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 bg-[#242424]/50 rounded px-1 py-1">
              {(
                [
                  ["usd", "USD"],
                  ["native", "ZIG"],
                ] as const
              ).map(([u, label]) => (
                <button
                  key={u}
                  onClick={() => {
                    if (isStZigToken && u === "usd") return;
                    setPriceDisplay(u);
                    setUnit(u);
                  }}
                  disabled={isStZigToken && u === "usd"}
                  className={`px-2 py-0.5 rounded text-xs ${
                    priceDisplay === u
                      ? "border border-yellow-300 text-yellow-200"
                      : "text-white/90 hover:text-white"
                  } ${
                    isStZigToken && u === "usd"
                      ? "opacity-50 cursor-not-allowed"
                      : ""
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div
          className={`flex flex-col items-end ${
            compact ? "hidden" : "mt-2 w-full md:mt-0 md:w-auto md:text-right"
          }`}
        >
          <div className="flex flex-col justify-end gap-1 md:flex-row">
            <button
              onClick={() => copyToClipboard("denom")}
              className="p-1.5 text-white hover:text-white relative group"
              title="Copy token address"
            >
              <Copy
                size={14}
                className={
                  copied.show && copied.type === "denom" ? "text-green-400" : ""
                }
              />
              {copied.show && copied.type === "denom" && (
                <span className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                  Token address copied!
                </span>
              )}
            </button>
            <button
              onClick={() => copyToClipboard("url")}
              className="p-1.5 text-white hover:text-white relative group"
              title="Copy link to this chart"
            >
              <Share2
                size={14}
                className={
                  copied.show && copied.type === "url" ? "text-green-400" : ""
                }
              />
              {copied.show && copied.type === "url" && (
                <span className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                  Link copied to clipboard!
                </span>
              )}
            </button>
            <button
              onClick={onToggleAuditPanel}
              className="p-1.5 text-white hover:text-white hidden md:block"
            >
              <Expand size={14} />
            </button>
          </div>
          <span className="text-white text-xs hidden md:block">
            {new Intl.DateTimeFormat(undefined, {
              dateStyle: "short",
              timeStyle: "short",
              timeZone: tz,
            }).format(new Date())}
          </span>
        </div>
      </div>

      <div
        className={`relative w-full flex-1 ${
          compact ? "min-h-[300px]" : "min-h-[320px] md:min-h-[568px]"
        }`}
      >
        {/* TradingView widget host */}
        <div ref={containerRef} className="absolute inset-0" />
      </div>
    </div>
  );
}
