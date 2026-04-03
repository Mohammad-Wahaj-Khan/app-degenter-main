"use client";

import { useEffect, useState } from "react";
import { tokenAPI, type TokenDetailResponse } from "@/lib/api";

type TokenSummaryData = TokenDetailResponse["data"] & {
  token?: TokenDetailResponse["data"]["token"];
};

type TokenSummaryMessage = {
  type?: string;
  ts?: string;
  token_id?: string | number;
  data?: TokenSummaryData;
};

const DEFAULT_WS_URL = process.env.NEXT_PUBLIC_TRADES_WS_URL || "";

const toNumber = (value?: string | number | null) => {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

type TokenSummaryListener = (data: TokenSummaryData, ts: Date) => void;
type ConnectionListener = (connected: boolean) => void;

const sharedSummaryConnection = {
  ws: null as WebSocket | null,
  wsUrl: "",
  connected: false,
  connecting: false,
  reconnectTimer: null as number | null,
  listeners: new Map<number, Set<TokenSummaryListener>>(),
  connectionListeners: new Set<ConnectionListener>(),
  lastByToken: new Map<number, { data: TokenSummaryData; ts: Date }>(),
  subscribed: new Set<number>(),
};

const notifyConnection = (connected: boolean) => {
  sharedSummaryConnection.connected = connected;
  sharedSummaryConnection.connectionListeners.forEach((listener) =>
    listener(connected)
  );
};

const sendSubscribe = (tokenId: number) => {
  if (!sharedSummaryConnection.ws || !sharedSummaryConnection.connected) return;
  if (sharedSummaryConnection.subscribed.has(tokenId)) return;
  sharedSummaryConnection.ws.send(
    JSON.stringify({
      type: "sub",
      stream: "token_summary",
      tokenId,
    })
  );
  sharedSummaryConnection.subscribed.add(tokenId);
};

const connectShared = (wsUrl: string) => {
  if (!wsUrl) return;
  if (
    sharedSummaryConnection.ws &&
    (sharedSummaryConnection.connected || sharedSummaryConnection.connecting) &&
    sharedSummaryConnection.wsUrl === wsUrl
  ) {
    return;
  }

  if (sharedSummaryConnection.ws) {
    sharedSummaryConnection.ws.close();
    sharedSummaryConnection.ws = null;
    sharedSummaryConnection.subscribed.clear();
  }

  sharedSummaryConnection.wsUrl = wsUrl;
  sharedSummaryConnection.connecting = true;

  const ws = new WebSocket(wsUrl);
  sharedSummaryConnection.ws = ws;

  ws.onopen = () => {
    sharedSummaryConnection.connecting = false;
    notifyConnection(true);
    sharedSummaryConnection.subscribed.clear();
    Array.from(sharedSummaryConnection.listeners.keys()).forEach((tokenId) =>
      sendSubscribe(tokenId)
    );
  };

  ws.onmessage = (event) => {
    try {
      const msg: TokenSummaryMessage = JSON.parse(event.data);
      if (msg.type !== "token_summary" || !msg.data) return;
      const tokenId = toNumber(
        msg.token_id ??
          msg.data?.token?.tokenId ??
          (msg.data as TokenSummaryData & { tokenId?: number | string })?.tokenId
      );
      if (!tokenId) return;

      const ts = new Date();
      sharedSummaryConnection.lastByToken.set(tokenId, {
        data: msg.data,
        ts,
      });

      const listeners = sharedSummaryConnection.listeners.get(tokenId);
      if (!listeners) return;
      listeners.forEach((listener) => listener(msg.data as TokenSummaryData, ts));
    } catch (err) {
      console.error("Token summary parse error:", err);
    }
  };

  ws.onclose = () => {
    sharedSummaryConnection.ws = null;
    sharedSummaryConnection.connecting = false;
    notifyConnection(false);
    if (sharedSummaryConnection.listeners.size === 0) return;
    sharedSummaryConnection.reconnectTimer = window.setTimeout(
      () => connectShared(wsUrl),
      3000
    );
  };

  ws.onerror = () => {
    ws.close();
  };
};

const subscribeToTokenSummary = (
  tokenId: number,
  wsUrl: string,
  onData: TokenSummaryListener,
  onConnected: ConnectionListener
) => {
  const listeners =
    sharedSummaryConnection.listeners.get(tokenId) ??
    new Set<TokenSummaryListener>();
  listeners.add(onData);
  sharedSummaryConnection.listeners.set(tokenId, listeners);
  sharedSummaryConnection.connectionListeners.add(onConnected);

  const cached = sharedSummaryConnection.lastByToken.get(tokenId);
  if (cached) {
    onData(cached.data, cached.ts);
  }
  onConnected(sharedSummaryConnection.connected);

  connectShared(wsUrl);
  sendSubscribe(tokenId);

  return () => {
    const tokenListeners = sharedSummaryConnection.listeners.get(tokenId);
    if (tokenListeners) {
      tokenListeners.delete(onData);
      if (tokenListeners.size === 0) {
        sharedSummaryConnection.listeners.delete(tokenId);
        sharedSummaryConnection.subscribed.delete(tokenId);
      }
    }

    sharedSummaryConnection.connectionListeners.delete(onConnected);

    if (sharedSummaryConnection.listeners.size === 0) {
      if (sharedSummaryConnection.reconnectTimer) {
        window.clearTimeout(sharedSummaryConnection.reconnectTimer);
        sharedSummaryConnection.reconnectTimer = null;
      }
      if (sharedSummaryConnection.ws) {
        sharedSummaryConnection.ws.close();
        sharedSummaryConnection.ws = null;
      }
      sharedSummaryConnection.connected = false;
      sharedSummaryConnection.connecting = false;
      sharedSummaryConnection.subscribed.clear();
    }
  };
};

export function useTokenSummary({
  tokenId,
  tokenKey,
}: {
  tokenId?: number | string | null;
  tokenKey?: string | null;
}) {
  const [data, setData] = useState<TokenSummaryData | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [connected, setConnected] = useState(false);
  const [resolvedTokenId, setResolvedTokenId] = useState<number | null>(
    toNumber(tokenId)
  );

  useEffect(() => {
    const nextId = toNumber(tokenId);
    if (nextId) {
      setResolvedTokenId(nextId);
      return;
    }

    if (!tokenKey) {
      setResolvedTokenId(null);
      return;
    }

    let active = true;
    tokenAPI
      .getTokenDetailsBySymbol(tokenKey, "best", true)
      .then((res) => {
        const resolved = toNumber(res?.data?.token?.tokenId);
        if (active && resolved) setResolvedTokenId(resolved);
      })
      .catch(() => {
        if (active) setResolvedTokenId(null);
      });

    return () => {
      active = false;
    };
  }, [tokenId, tokenKey]);

  const wsUrl =
    process.env.NEXT_PUBLIC_TOKEN_SUMMARY_WS_URL ||
    process.env.NEXT_PUBLIC_WS_URL ||
    DEFAULT_WS_URL;

  useEffect(() => {
    if (!resolvedTokenId || !wsUrl) return;

    let active = true;
    const unsubscribe = subscribeToTokenSummary(
      resolvedTokenId,
      wsUrl,
      (next, ts) => {
        if (!active) return;
        setData(next);
        setLastUpdated(ts);
      },
      (isConnected) => {
        if (!active) return;
        setConnected(isConnected);
      }
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [resolvedTokenId, wsUrl]);

  return { data, lastUpdated, connected, tokenId: resolvedTokenId };
}
