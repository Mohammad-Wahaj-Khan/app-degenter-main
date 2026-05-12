"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, Copy, ExternalLink, X } from "lucide-react";
import Hash from "../components/forensics/Hash";
import {
  formatDenom,
  formatTimestamp,
  getHotWalletInfo,
} from "../../lib/forensics/utils";
import { bech32 } from "bech32";
import {
  ForensicsProfile,
  ForensicsTransfer,
  ForensicsTokenFlow,
  ForensicsTimeline,
  ForensicsContracts,
  ForensicsStaking,
  ForensicsRisk,
  ForensicsCounterparty,
} from "../../lib/api/forensics";
import { CounterpartyGroup } from "./types";

type PanelVariant = "detail" | "transactions" | "profile";

type ForensicsPanelProps = {
  open: boolean;
  variant: PanelVariant;
  selectedGroup: { side: "L" | "R"; group: CounterpartyGroup } | null;
  centerAddress: string;
  onClose: () => void;
  transfers?: ForensicsTransfer[];
  transfersMeta?: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
  transfersLoading?: boolean;
  onTransfersPageChange?: (page: number) => void;
  profile?: ForensicsProfile | null;
  tokenFlow?: ForensicsTokenFlow | null;
  timeline?: ForensicsTimeline | null;
  contracts?: ForensicsContracts | null;
  staking?: ForensicsStaking | null;
  risk?: ForensicsRisk | null;
  tokenMetadata?: Record<
    string,
    {
      symbol?: string;
      decimals?: number;
      imageUrl?: string;
    }
  >;
  analyticsLoading?: boolean;
  analyticsError?: string | null;
};

const insertThousandsSeparators = (value: string) =>
  value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const truncate = (value?: string) =>
  value ? `${value.slice(0, 10)}...${value.slice(-6)}` : "—";

const truncateHash = (value?: string) =>
  value ? `${value.slice(0, 8)}...${value.slice(-4)}` : "—";

const ZIG_REGEX = /^zig1[023456789acdefghjklmnpqrstuvwxyz]{38,72}$/i;

const detectAddressType = (address?: string | null) => {
  const normalized = address?.trim() || "";
  if (!normalized || !ZIG_REGEX.test(normalized)) {
    return normalized.length > 50 ? "contract" : "address";
  }

  try {
    const decoded = bech32.decode(normalized.toLowerCase());
    const data = Uint8Array.from(bech32.fromWords(decoded.words));
    if (decoded.prefix === "zig" && data.length === 32) return "contract";
    if (decoded.prefix === "zig" && data.length === 20) return "address";
  } catch {
    // Fall through to heuristic below.
  }

  return normalized.length > 50 ? "contract" : "address";
};

const getTokenDisplayMeta = (
  denom?: string | null,
  tokenMetadata?: Record<
    string,
    { symbol?: string; decimals?: number; imageUrl?: string }
  >,
) => {
  if (!denom) return { symbol: "—", decimals: 0 };
  if (denom === "uzig") {
    return {
      symbol: "ZIG",
      decimals: 6,
    };
  }

  return {
    symbol: tokenMetadata?.[denom]?.symbol || formatDenom(denom),
    decimals: tokenMetadata?.[denom]?.decimals ?? 0,
  };
};

const getDisplayDenom = (
  denom?: string | null,
  tokenMetadata?: Record<
    string,
    { symbol?: string; decimals?: number; imageUrl?: string }
  >,
) => {
  if (!denom) return "—";
  return getTokenDisplayMeta(denom, tokenMetadata).symbol;
};

const getDisplayDecimals = (
  denom?: string | null,
  tokenMetadata?: Record<
    string,
    { symbol?: string; decimals?: number; imageUrl?: string }
  >,
) => {
  return getTokenDisplayMeta(denom, tokenMetadata).decimals;
};

const formatAmount = (
  value: string | number | null | undefined,
  decimals = 0,
) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "0";

  const sign = raw.startsWith("-") ? "-" : "";
  const digitsOnly = raw.replace(/^-/, "").replace(/\D/g, "");
  if (!digitsOnly) return "0";

  if (decimals <= 0) {
    const normalized = digitsOnly.replace(/^0+(?=\d)/, "");
    return `${sign}${insertThousandsSeparators(normalized || "0")}`;
  }

  const padded = digitsOnly.padStart(decimals + 1, "0");
  const integerDigits =
    padded.slice(0, -decimals).replace(/^0+(?=\d)/, "") || "0";
  const fractionalDigits = padded.slice(-decimals);

  const trimmedFractional = fractionalDigits.replace(/0+$/, "");
  if (!trimmedFractional) {
    return `${sign}${insertThousandsSeparators(integerDigits)}`;
  }

  const visibleFractional =
    integerDigits === "0"
      ? trimmedFractional.slice(0, Math.min(decimals, 6)).replace(/0+$/, "")
      : trimmedFractional.slice(0, 2).replace(/0+$/, "");

  if (!visibleFractional) {
    return `${sign}${insertThousandsSeparators(integerDigits)}`;
  }

  return `${sign}${insertThousandsSeparators(integerDigits)}.${visibleFractional}`;
};

const messageTypeLabel = (type?: string) => {
  if (!type) return "unknown";
  const parts = type.split(".");
  return parts[parts.length - 1] || type;
};

const EmptyPane = ({ message }: { message: string }) => (
  <div className="fp-empty">
    <span>{message}</span>
  </div>
);

const TxListSkeleton = () => (
  <div className="space-y-4">
    {[1, 2, 3].map((i) => (
      <div key={i} className="fp-tx-row animate-pulse-fast">
        <div className="h-4 w-28 rounded bg-[#15214a]/60 animate-shimmer" />
        <div className="h-4 w-4 rounded-full bg-[#15214a]/40" />
        <div className="h-4 w-32 rounded bg-[#15214a]/60 animate-shimmer" />
        <div className="ml-auto h-4 w-20 rounded bg-[#15214a]/40" />
      </div>
    ))}
  </div>
);

const splitTransfersByDirection = (
  transfers: ForensicsTransfer[],
  centerAddress: string,
) => {
  const sent: ForensicsTransfer[] = [];
  const received: ForensicsTransfer[] = [];

  transfers.forEach((tx) => {
    if (tx?.to_addr === centerAddress) {
      received.push(tx);
    } else {
      sent.push(tx);
    }
  });

  return { sent, received };
};

const StatCard = ({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) => (
  <div className="fp-stat-card">
    <span className="fp-stat-label">{label}</span>
    <span className={`fp-stat-value ${accent ? "accent" : ""}`}>{value}</span>
  </div>
);

function PanelHeader({
  variant,
  selectedGroup,
  centerAddress,
  onClose,
  transfersTotal,
}: {
  variant: PanelVariant;
  selectedGroup: { side: "L" | "R"; group: CounterpartyGroup } | null;
  centerAddress: string;
  onClose: () => void;
  transfersTotal: number;
}) {
  const detailAddress = selectedGroup?.group?.address ?? centerAddress;
  const detailAddressType = detectAddressType(detailAddress);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (
      variant !== "detail" ||
      !detailAddress ||
      typeof navigator === "undefined" ||
      !navigator.clipboard
    ) {
      return;
    }
    try {
      await navigator.clipboard.writeText(detailAddress);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="fp-header">
      <div className="fp-header-meta">
        <span className="fp-eyebrow">
          {variant === "detail" &&
            (detailAddressType === "contract" ? "Contract" : "Address")}
          {variant === "transactions" && "Transactions"}
          {variant === "profile" && "Profile"}
        </span>
        <div className="fp-title-row">
          <span className="fp-title">
            {variant === "detail" &&
              (getHotWalletInfo(detailAddress)?.label ||
                truncate(detailAddress))}
            {variant === "transactions" && `${transfersTotal} transfers`}
            {variant === "profile" &&
              (centerAddress
                ? getHotWalletInfo(centerAddress)?.label ||
                  truncate(centerAddress)
                : "Analytics")}
          </span>
          {variant === "detail" && detailAddress ? (
            <button
              className={`fp-copy-btn fp-copy-btn-header ${copied ? "is-copied" : ""}`}
              onClick={handleCopy}
              aria-label={copied ? "Address copied" : "Copy address"}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
          ) : null}
        </div>
      </div>
      <button className="fp-close" onClick={onClose} aria-label="Close panel">
        <X size={14} />
      </button>
    </div>
  );
}

function DetailPane({
  group,
}: {
  group: { side: "L" | "R"; group: CounterpartyGroup } | null;
}) {
  if (!group?.group) return <EmptyPane message="Click a node to inspect it" />;

  return (
    <div className="fp-section-stack">
      <section className="fp-section">
        <div className="fp-stat-grid">
          <StatCard
            label="Transactions"
            value={group.group.transactions?.length ?? 0}
          />
          <StatCard
            label="Total volume"
            value={group.group.totalVolumeFormatted ?? "—"}
            accent
          />
          <StatCard
            label="Last active"
            value={group.group.lastActiveFormatted ?? "—"}
          />
        </div>
      </section>
    </div>
  );
}

function DetailWithTransfers({
  group,
  transfers,
  transfersLoading,
  centerAddress,
  tokenMetadata,
}: {
  group: { side: "L" | "R"; group: CounterpartyGroup } | null;
  transfers: ForensicsTransfer[];
  transfersLoading: boolean;
  centerAddress: string;
  tokenMetadata?: Record<
    string,
    { symbol?: string; decimals?: number; imageUrl?: string }
  >;
}) {
  const { sent, received } = useMemo(
    () => splitTransfersByDirection(transfers, centerAddress),
    [transfers, centerAddress],
  );
  const [copiedTxHash, setCopiedTxHash] = useState<string | null>(null);

  const handleCopyTxHash = async (txHash?: string) => {
    if (!txHash || typeof navigator === "undefined" || !navigator.clipboard)
      return;
    try {
      await navigator.clipboard.writeText(txHash);
      setCopiedTxHash(txHash);
      window.setTimeout(() => {
        setCopiedTxHash((current) => (current === txHash ? null : current));
      }, 2000);
    } catch {
      setCopiedTxHash(null);
    }
  };

  return (
    <div className="fp-section-stack">
      <DetailPane group={group} />

      <section className="fp-section">
        <div className="fp-section-static-header">
          <span className="fp-section-title">Transactions</span>
        </div>

        {transfersLoading ? (
          <TxListSkeleton />
        ) : transfers.length === 0 ? (
          <EmptyPane message="No transactions" />
        ) : (
          <div className="space-y-4">
            {sent.length > 0 ? (
              <div>
                <div className="fp-subsection-title">Sent ({sent.length})</div>
                <div className="fp-tx-list">
                  {sent.map((tx, index) => (
                    <div
                      key={`${tx.tx_hash}-${tx.height}-${index}`}
                      className="fp-tx-row"
                    >
                      <span className="fp-tx-hash-wrap">
                        <Hash
                          value={tx.tx_hash}
                          type="tx"
                          variant="link"
                          startLength={8}
                          endLength={4}
                          showTooltip={false}
                          className="!gap-1.5"
                        />
                      </span>
                      <span className="fp-tx-dir out">↑</span>
                      <span className="fp-tx-amount">
                        {formatAmount(
                          tx.amount,
                          getDisplayDecimals(tx.denom, tokenMetadata),
                        )}{" "}
                        {getDisplayDenom(tx.denom, tokenMetadata)}
                      </span>
                      <span className="fp-tx-time">
                        {tx.time ? formatTimestamp(tx.time) : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {received.length > 0 ? (
              <div>
                <div className="fp-subsection-title">
                  Received ({received.length})
                </div>
                <div className="fp-tx-list">
                  {received.map((tx, index) => (
                    <div
                      key={`${tx.tx_hash}-${tx.height}-${index}`}
                      className="fp-tx-row"
                    >
                      <span className="fp-tx-hash-wrap">
                        <Hash
                          value={tx.tx_hash}
                          type="tx"
                          variant="link"
                          startLength={8}
                          endLength={4}
                          showTooltip={false}
                          className="!gap-1.5"
                        />
                      </span>
                      <span className="fp-tx-dir in">↓</span>
                      <span className="fp-tx-amount">
                        {formatAmount(
                          tx.amount,
                          getDisplayDecimals(tx.denom, tokenMetadata),
                        )}{" "}
                        {getDisplayDenom(tx.denom, tokenMetadata)}
                      </span>
                      <span className="fp-tx-time">
                        {tx.time ? formatTimestamp(tx.time) : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

function TransactionsPane({
  transfers,
  transfersLoading,
  transfersMeta,
  onTransfersPageChange,
  centerAddress,
  tokenMetadata,
}: {
  transfers: ForensicsTransfer[];
  transfersLoading: boolean;
  transfersMeta: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
  onTransfersPageChange?: (page: number) => void;
  centerAddress: string;
  tokenMetadata?: Record<
    string,
    { symbol?: string; decimals?: number; imageUrl?: string }
  >;
}) {
  const { sent, received } = useMemo(
    () => splitTransfersByDirection(transfers, centerAddress),
    [transfers, centerAddress],
  );
  const [copiedTxHash, setCopiedTxHash] = useState<string | null>(null);

  const handleCopyTxHash = async (txHash?: string) => {
    if (!txHash || typeof navigator === "undefined" || !navigator.clipboard)
      return;
    try {
      await navigator.clipboard.writeText(txHash);
      setCopiedTxHash(txHash);
      window.setTimeout(() => {
        setCopiedTxHash((current) => (current === txHash ? null : current));
      }, 2000);
    } catch {
      setCopiedTxHash(null);
    }
  };

  if (transfersLoading) return <TxListSkeleton />;
  if (!transfers.length) return <EmptyPane message="No transactions" />;

  return (
    <div className="fp-section-stack">
      <div className="space-y-4">
        {sent.length > 0 ? (
          <div>
            <div className="fp-subsection-title">
              Sent by primary ({sent.length})
            </div>
            <div className="fp-tx-list">
              {sent.slice(0, 8).map((tx, index) => (
                <div
                  key={`${tx.tx_hash}-${tx.height}-${index}`}
                  className="fp-tx-row"
                >
                  <span className="fp-tx-hash-wrap">
                    <Hash
                      value={tx.tx_hash}
                      type="tx"
                      variant="link"
                      startLength={8}
                      endLength={4}
                      showTooltip={false}
                      className="!gap-1.5"
                    />
                  </span>
                  <span className="fp-tx-dir out">↑</span>
                  <span className="fp-tx-amount">
                    {formatAmount(
                      tx.amount,
                      getDisplayDecimals(tx.denom, tokenMetadata),
                    )}{" "}
                    {getDisplayDenom(tx.denom, tokenMetadata)}
                  </span>
                  <span className="fp-tx-time">
                    {tx.time ? formatTimestamp(tx.time) : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {received.length > 0 ? (
          <div>
            <div className="fp-subsection-title">
              Received by primary ({received.length})
            </div>
            <div className="fp-tx-list">
              {received.slice(0, 8).map((tx, index) => (
                <div
                  key={`${tx.tx_hash}-${tx.height}-${index}`}
                  className="fp-tx-row"
                >
                  <span className="fp-tx-hash-wrap">
                    <Hash
                      value={tx.tx_hash}
                      type="tx"
                      variant="link"
                      startLength={8}
                      endLength={4}
                      showTooltip={false}
                      className="!gap-1.5"
                    />
                  </span>
                  <span className="fp-tx-dir in">↓</span>
                  <span className="fp-tx-amount">
                    {formatAmount(
                      tx.amount,
                      getDisplayDecimals(tx.denom, tokenMetadata),
                    )}{" "}
                    {getDisplayDenom(tx.denom, tokenMetadata)}
                  </span>
                  <span className="fp-tx-time">
                    {tx.time ? formatTimestamp(tx.time) : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {Math.ceil(
        (transfersMeta.total || 0) / Math.max(1, transfersMeta.limit),
      ) > 1 ? (
        <div className="fp-pagination">
          <button
            disabled={transfersMeta.page <= 1}
            onClick={() =>
              onTransfersPageChange?.(Math.max(1, transfersMeta.page - 1))
            }
            className="fp-page-btn"
          >
            ←
          </button>
          <span className="fp-page-info">
            {transfersMeta.page} /{" "}
            {Math.max(
              1,
              Math.ceil(
                (transfersMeta.total || 0) / Math.max(1, transfersMeta.limit),
              ),
            )}
          </span>
          <button
            disabled={!transfersMeta.hasMore}
            onClick={() => onTransfersPageChange?.(transfersMeta.page + 1)}
            className="fp-page-btn"
          >
            →
          </button>
        </div>
      ) : null}
    </div>
  );
}

type SectionId =
  | "overview"
  | "risk"
  | "counterparties"
  | "messages"
  | "tokenFlow"
  | "timeline"
  | "contracts"
  | "staking";

function Section({
  id,
  title,
  collapsible = true,
  openSection,
  onToggle,
  children,
}: {
  id: SectionId;
  title: string;
  collapsible?: boolean;
  openSection: SectionId | null;
  onToggle: (id: SectionId) => void;
  children: ReactNode;
}) {
  const isOpen = collapsible ? openSection === id : true;
  return (
    <section
      className={`fp-section fp-accordion-section ${isOpen ? "open" : ""}`}
    >
      {collapsible ? (
        <button
          type="button"
          className="fp-section-toggle"
          onClick={() => onToggle(id)}
        >
          <span className="fp-section-title">{title}</span>
          <ChevronDown
            className={`h-4 w-4 fp-section-chevron ${isOpen ? "open" : ""}`}
          />
        </button>
      ) : (
        <div className="fp-section-static-header">
          <span className="fp-section-title">{title}</span>
        </div>
      )}
      {isOpen ? <div className="fp-section-content">{children}</div> : null}
    </section>
  );
}

function ProfilePane({
  centerAddress,
  profile,
  tokenFlow,
  timeline,
  contracts,
  staking,
  risk,
  analyticsLoading,
  analyticsError,
}: {
  centerAddress: string;
  profile: ForensicsProfile | null;
  tokenFlow: ForensicsTokenFlow | null;
  timeline: ForensicsTimeline | null;
  contracts: ForensicsContracts | null;
  staking: ForensicsStaking | null;
  risk: ForensicsRisk | null;
  analyticsLoading?: boolean;
  analyticsError?: string | null;
}) {
  const [openSection, setOpenSection] = useState<SectionId | null>("overview");

  const overviewSummary = useMemo(() => {
    const uniqueTxs = profile?.activity?.unique_txs ?? 0;
    const failedTxs = profile?.activity?.failed_txs ?? 0;
    const sentDenoms = profile?.transfers?.sent?.unique_denoms ?? 0;
    const receivedDenoms = profile?.transfers?.received?.unique_denoms ?? 0;
    const firstActive = profile?.activity?.first_active
      ? formatTimestamp(profile.activity.first_active)
      : null;
    const lastActive = profile?.activity?.last_active
      ? formatTimestamp(profile.activity.last_active)
      : null;
    const rapidBursts = risk?.risk_indicators?.rapid_fire_events?.length ?? 0;
    const roundAmounts = risk?.risk_indicators?.round_amounts?.length ?? 0;
    const contractCalls = profile?.contracts?.total_calls ?? 0;
    const topMessages = (profile?.message_types || [])
      .slice(0, 2)
      .map((message: any) => messageTypeLabel(message.type_url));

    const activityWindow =
      firstActive && lastActive
        ? `from ${firstActive} through ${lastActive}`
        : lastActive
          ? `with most recent activity on ${lastActive}`
          : firstActive
            ? `starting on ${firstActive}`
            : "with no timestamp window available";

    const transferMix =
      sentDenoms > 0 || receivedDenoms > 0
        ? `It has interacted across ${sentDenoms} sent denoms and ${receivedDenoms} received denoms`
        : "Transfer-denom diversity is currently unavailable";

    const reliability =
      failedTxs > 0
        ? `including ${failedTxs} failed transactions`
        : "with no failed transactions recorded";

    const behavioralSignals =
      rapidBursts > 0 || roundAmounts > 0
        ? `Risk signals include ${rapidBursts} rapid-fire bursts and ${roundAmounts} round-amount patterns`
        : "No strong rapid-fire or round-amount risk signals are currently flagged";

    const executionContext =
      contractCalls > 0
        ? `Contract interaction is present with ${contractCalls} tracked calls`
        : "No contract-call activity stands out in the current profile";

    const messageContext =
      topMessages.length > 0
        ? `Common message activity includes ${topMessages.join(" and ")}`
        : "No dominant message pattern is currently available";

    return `This address has ${uniqueTxs} unique transactions ${activityWindow}. ${transferMix}, ${reliability}. ${executionContext}. ${behavioralSignals}. ${messageContext}.`;
  }, [profile, risk]);

  if (analyticsLoading && !profile)
    return <EmptyPane message="Loading analytics" />;
  if (!profile && analyticsError) return <EmptyPane message={analyticsError} />;
  if (!profile) return <EmptyPane message="No profile data" />;

  const topCounterparties = (
    risk?.risk_indicators?.top_counterparties || []
  ).map((cp: any) => ({
    address: cp.counterparty || cp.address || "—",
    count: cp.tx_count ?? cp.count ?? 0,
  }));
  const messageTypes = profile?.message_types || [];
  const tokenFlows = tokenFlow?.flows || [];
  const timelineRows = timeline?.data || [];
  const contractRows = contracts?.contracts || [];
  const stakingRows = staking?.staking || [];

  const toggleSection = (key: SectionId) => {
    setOpenSection((current) => (current === key ? null : key));
  };

  const s = { openSection, onToggle: toggleSection };

  return (
    <div className="fp-section-stack">
      <Section {...s} id="overview" title="Overview" collapsible={false}>
        <p className="fp-overview-summary">{overviewSummary}</p>
        <div className="fp-stat-grid">
          <StatCard
            label="Unique TXs"
            value={profile?.activity?.unique_txs ?? 0}
          />
          <StatCard
            label="Failed TXs"
            value={profile?.activity?.failed_txs ?? 0}
            accent={(profile?.activity?.failed_txs ?? 0) > 0}
          />
          <StatCard
            label="Sent denoms"
            value={profile?.transfers?.sent?.unique_denoms ?? 0}
          />
          <StatCard
            label="Received denoms"
            value={profile?.transfers?.received?.unique_denoms ?? 0}
          />
        </div>
      </Section>

      <Section {...s} id="risk" title="Risk signals">
        <div className="fp-stat-grid">
          <StatCard
            label="Rapid-fire bursts"
            value={risk?.risk_indicators?.rapid_fire_events?.length ?? 0}
            accent={(risk?.risk_indicators?.rapid_fire_events?.length ?? 0) > 0}
          />
          <StatCard
            label="Round amounts"
            value={risk?.risk_indicators?.round_amounts?.length ?? 0}
          />
          <StatCard
            label="Top counterparties"
            value={topCounterparties.length}
          />
          <StatCard
            label="Active span"
            value={`${risk?.risk_indicators?.account_age?.active_days_span ?? 0}d`}
          />
        </div>
      </Section>

      <Section {...s} id="counterparties" title="Top counterparties">
        {topCounterparties.length > 0 ? (
          <div className="fp-counterparty-list">
            {topCounterparties.map((cp: any, index: number) => (
              <div
                key={`${cp.address}-${index}`}
                className="fp-counterparty-row"
              >
                <span className="fp-cp-address">{truncate(cp.address)}</span>
                <span className="fp-cp-count">{cp.count}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyPane
            message={
              analyticsLoading
                ? "Loading counterparties"
                : "No counterparty data yet"
            }
          />
        )}
      </Section>

      <Section {...s} id="messages" title="Message types">
        {messageTypes.length > 0 ? (
          <div className="fp-msg-list">
            {messageTypes.slice(0, 10).map((message, index: number) => (
              <div key={`${message.type_url}-${index}`} className="fp-msg-row">
                <span className="fp-msg-type">
                  {messageTypeLabel(message.type_url)}
                </span>
                <span className="fp-msg-count">{message.count}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyPane
            message={
              analyticsLoading
                ? "Loading message types"
                : "No message type data yet"
            }
          />
        )}
      </Section>

      <Section {...s} id="tokenFlow" title="Token flow">
        {tokenFlows.length > 0 ? (
          <div className="fp-counterparty-list">
            {tokenFlows.slice(0, 8).map((flow) => (
              <div key={flow.denom} className="fp-msg-row">
                <span className="fp-msg-type">
                  {flow.symbol || formatDenom(flow.denom)}
                </span>
                <span className="fp-msg-count">
                  {formatAmount(flow.net_flow, flow.decimals)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyPane
            message={
              analyticsLoading ? "Loading token flow" : "No token flow data yet"
            }
          />
        )}
      </Section>

      <Section {...s} id="timeline" title="Timeline">
        {timelineRows.length > 0 ? (
          <div className="fp-counterparty-list">
            {timelineRows
              .slice(-6)
              .reverse()
              .map((row) => (
                <div key={row.bucket} className="fp-msg-row">
                  <span className="fp-msg-type">
                    {formatTimestamp(row.bucket)}
                  </span>
                  <span className="fp-msg-count">{row.tx_count} txs</span>
                </div>
              ))}
          </div>
        ) : (
          <EmptyPane
            message={
              analyticsLoading ? "Loading timeline" : "No timeline data yet"
            }
          />
        )}
      </Section>

      <Section {...s} id="contracts" title="Contracts">
        {contractRows.length > 0 ? (
          <div className="fp-counterparty-list">
            {contractRows.slice(0, 8).map((contract: any) => (
              <div key={contract.contract} className="fp-msg-row">
                <span className="fp-msg-type">
                  {contract.label || truncate(contract.contract)}
                </span>
                <span className="fp-msg-count">{contract.call_count}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyPane
            message={
              analyticsLoading
                ? "Loading contract data"
                : "No contract data yet"
            }
          />
        )}
      </Section>

      <Section {...s} id="staking" title="Staking">
        {stakingRows.length > 0 ? (
          <div className="fp-counterparty-list">
            {stakingRows.slice(0, 8).map((entry, index: number) => (
              <div key={`${entry.event_type}-${index}`} className="fp-msg-row">
                <span className="fp-msg-type">
                  {String(entry.event_type || "staking").replace(/_/g, " ")}
                </span>
                <span className="fp-msg-count">{entry.event_count}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyPane
            message={
              analyticsLoading ? "Loading staking data" : "No staking data yet"
            }
          />
        )}
      </Section>
    </div>
  );
}

export default function ForensicsPanel({
  open,
  variant,
  selectedGroup,
  centerAddress,
  onClose,
  transfers = [],
  transfersMeta = { page: 1, limit: 10, total: 0, hasMore: false },
  transfersLoading = false,
  onTransfersPageChange,
  profile = null,
  tokenFlow = null,
  timeline = null,
  contracts = null,
  staking = null,
  risk = null,
  tokenMetadata = {},
  analyticsLoading = false,
  analyticsError = null,
}: ForensicsPanelProps) {
  return (
    <div className={`forensics-panel ${open ? "open" : ""}`}>
      <PanelHeader
        variant={variant}
        selectedGroup={selectedGroup}
        centerAddress={centerAddress}
        onClose={onClose}
        transfersTotal={transfersMeta.total || transfers.length}
      />

      <div className="fp-body">
        {variant === "detail" ? (
          <DetailWithTransfers
            group={selectedGroup}
            transfers={transfers}
            transfersLoading={transfersLoading}
            centerAddress={centerAddress}
            tokenMetadata={tokenMetadata}
          />
        ) : variant === "transactions" ? (
          <TransactionsPane
            transfers={transfers}
            transfersLoading={transfersLoading}
            transfersMeta={transfersMeta}
            onTransfersPageChange={onTransfersPageChange}
            centerAddress={centerAddress}
            tokenMetadata={tokenMetadata}
          />
        ) : (
          <ProfilePane
            centerAddress={centerAddress}
            profile={profile}
            tokenFlow={tokenFlow}
            timeline={timeline}
            contracts={contracts}
            staking={staking}
            risk={risk}
            analyticsLoading={analyticsLoading}
            analyticsError={analyticsError}
          />
        )}
      </div>
    </div>
  );
}
