"use client";

import type {
  ForensicsContracts,
  ForensicsCounterpartiesResult,
  ForensicsCounterparty,
  ForensicsEnvelope,
  ForensicsProfile,
  ForensicsRisk,
  ForensicsStaking,
  ForensicsTimeline,
  ForensicsTokenFlow,
  ForensicsTransfer,
  ForensicsTransfersResult,
} from "../forensics/schema";

const API_BASE_URL = "/api/zigscan-beta";

async function forensicsGet<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  const searchParams = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      searchParams.set(key, String(value));
    }
  });

  const query = searchParams.toString();
  const response = await fetch(
    `${API_BASE_URL}${path}${query ? `?${query}` : ""}`,
    {
      method: "GET",
      cache: "no-store",
    },
  );

  const text = await response.text();
  const json = text ? (JSON.parse(text) as ForensicsEnvelope<T>) : null;

  if (!response.ok || !json || json.status !== "1") {
    throw new Error(json?.message || "Request failed");
  }

  return json.result;
}

export async function getForensicsTransfers(
  address: string,
  counterparty: string,
  params?: {
    page?: number;
    limit?: number;
    denom?: string;
    includeCount?: boolean;
  },
) {
  const searchParams = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      searchParams.set(key, String(value));
    }
  });

  const query = searchParams.toString();
  const response = await fetch(
    `${API_BASE_URL}/forensics/${encodeURIComponent(address)}/counterparties/${encodeURIComponent(counterparty)}/transfers${query ? `?${query}` : ""}`,
    {
      method: "GET",
      cache: "no-store",
    },
  );

  const text = await response.text();
  const json = text
    ? (JSON.parse(text) as ForensicsEnvelope<ForensicsTransfer[]>)
    : null;

  if (!response.ok || !json || json.status !== "1") {
    throw new Error(json?.message || "Request failed");
  }

  return {
    data: Array.isArray(json.result) ? json.result : [],
    meta: {
      page: json.meta?.page ?? params?.page ?? 1,
      limit: json.meta?.limit ?? params?.limit ?? 20,
      total:
        json.meta?.total ??
        (Array.isArray(json.result) ? json.result.length : 0),
      hasMore: json.meta?.hasMore ?? false,
    },
    partial: Boolean(json.partial),
  } satisfies ForensicsTransfersResult;
}

export function getForensicsProfile(address: string) {
  return forensicsGet<ForensicsProfile>(
    `/forensics/${encodeURIComponent(address)}/profile`,
  );
}

export function getForensicsCounterparties(
  address: string,
  params?: {
    denom?: string;
    limit?: number;
    direction?: "sent" | "received" | "all";
    min_amount?: number;
  },
) {
  return forensicsGet<ForensicsCounterpartiesResult>(
    `/forensics/${encodeURIComponent(address)}/counterparties`,
    params,
  );
}

export function getForensicsTokenFlow(
  address: string,
  params?: { range?: "7d" | "30d" | "90d" | "all" },
) {
  return forensicsGet<ForensicsTokenFlow>(
    `/forensics/${encodeURIComponent(address)}/token-flow`,
    params,
  );
}

export function getForensicsTimeline(
  address: string,
  params: { range: "7d" | "30d" | "90d"; interval?: "1h" | "1d" },
) {
  return forensicsGet<ForensicsTimeline>(
    `/forensics/${encodeURIComponent(address)}/timeline`,
    params,
  );
}

export function getForensicsContracts(
  address: string,
  params?: { limit?: number },
) {
  return forensicsGet<ForensicsContracts>(
    `/forensics/${encodeURIComponent(address)}/contracts`,
    params,
  );
}

export function getForensicsStaking(address: string) {
  return forensicsGet<ForensicsStaking>(
    `/forensics/${encodeURIComponent(address)}/staking`,
  );
}

export function getForensicsRisk(address: string) {
  return forensicsGet<ForensicsRisk>(
    `/forensics/${encodeURIComponent(address)}/risk`,
  );
}

export type {
  ForensicsContracts,
  ForensicsCounterpartiesResult,
  ForensicsCounterparty,
  ForensicsProfile,
  ForensicsRisk,
  ForensicsStaking,
  ForensicsTimeline,
  ForensicsTokenFlow,
  ForensicsTransfer,
  ForensicsTransfersResult,
};
