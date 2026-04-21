"use client";

type WsHealthState = {
  failures: number;
  blockedUntil: number;
};

const wsHealth = new Map<string, WsHealthState>();

const normalizeUrl = (url?: string | null) => (url ?? "").trim();

const now = () => Date.now();

export const canAttemptWebSocket = (url?: string | null) => {
  const key = normalizeUrl(url);
  if (!key) return false;
  const state = wsHealth.get(key);
  if (!state) return true;
  return state.blockedUntil <= now();
};

export const getWebSocketCooldownMs = (url?: string | null) => {
  const key = normalizeUrl(url);
  if (!key) return Infinity;
  const state = wsHealth.get(key);
  if (!state) return 0;
  return Math.max(0, state.blockedUntil - now());
};

export const markWebSocketFailure = (url?: string | null) => {
  const key = normalizeUrl(url);
  if (!key) return 30_000;
  const current = wsHealth.get(key) ?? { failures: 0, blockedUntil: 0 };
  const failures = current.failures + 1;
  const cooldown = Math.min(30_000, 1_000 * Math.pow(2, failures));
  wsHealth.set(key, {
    failures,
    blockedUntil: now() + cooldown,
  });
  return cooldown;
};

export const markWebSocketHealthy = (url?: string | null) => {
  const key = normalizeUrl(url);
  if (!key) return;
  wsHealth.delete(key);
};
