"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  ControlButton,
  EdgeProps,
  Handle,
  MarkerType,
  MiniMap,
  NodeProps,
  ReactFlowInstance,
  getBezierPath,
  useEdgesState,
  useNodesState,
  Position,
  Node,
  Edge,
} from "reactflow";
import type { CounterpartyGroup } from "./types";

import { Check, Copy, Lock, Unlock, Sparkles, Eye, Activity, TrendingUp, Zap } from "lucide-react";
import { FaExternalLinkAlt } from "react-icons/fa";
import { fromBech32 } from "@cosmjs/encoding";
import { getHotWalletInfo } from "../../lib/forensics/utils";

// --- DEFINED TYPES ---
type ForensicsAddressKind = "wallet" | "contract";

interface ForensicsAnnotatedEdgeData {
  orientation: "horizontal" | "vertical";
  totalVolume?: string;
  totalVolumeColor?: string;
  lastActive?: string;
  isActive?: boolean;
  miniLabel?: string;
  labelTargetId?: string;
  onLabelClick?: (targetId: string) => void;
}

interface ForensicsCanvasProps {
  centerLabel: string;
  senderAccounts: CounterpartyGroup[];
  recipientAccounts: CounterpartyGroup[];
  loading: boolean;
  overlayMessage: string | null;
  onNodeClick: (nodeId: string) => void;
  getNodeId: (side: "L" | "R", group: CounterpartyGroup, idx: number) => string;
  onCanvasClick: () => void;
  onExploreAddress: (address: string) => void;
}
// -----------------------------------

const MAX_ANIMATED_EDGES = 12;
const VISIBLE_LIMIT = 8;

const ZIG_REGEX = /^zig1[023456789acdefghjklmnpqrstuvwxyz]{38,72}$/i;

function decodeZigAddress(address: string) {
  const normalized = address.trim();
  if (!ZIG_REGEX.test(normalized)) return null;
  try {
    const decoded = fromBech32(normalized.toLowerCase());
    return { prefix: decoded.prefix, dataLength: decoded.data.length };
  } catch {
    return null;
  }
}

function detectAddressType(address: string): ForensicsAddressKind {
  const decoded = decodeZigAddress(address);
  if (decoded?.prefix === "zig") {
    if (decoded.dataLength === 32) return "contract";
    if (decoded.dataLength === 20) return "wallet";
  }
  return address.trim().length > 50 ? "contract" : "wallet";
}

const formatEdgeSummary = (count: number, direction: "sent" | "received") => {
  const label = direction === "sent" ? "tx sent" : "tx recv";
  const displayCount =
    count <= 0 ? "0" : count > 100 ? "100+" : Math.floor(count).toString();
  return `${displayCount} ${label}`;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const estimateHorizontalRunway = (labelText?: string | null) => {
  const width = clamp((labelText || "").length * 7.2 + 32, 140, 360);
  return clamp(width + 88, 120, 420);
};

const buildCenteredOffsets = (footprints: number[], gap: number) => {
  if (footprints.length === 0) return [];
  const totalHeight =
    footprints.reduce((sum, footprint) => sum + footprint, 0) +
    gap * Math.max(0, footprints.length - 1);
  let cursor = -totalHeight / 2;

  return footprints.map((footprint) => {
    const center = cursor + footprint / 2;
    cursor += footprint + gap;
    return center;
  });
};

// Animated Edge Component with smooth dark-themed animation
const AnnotatedEdgeBase = ({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
}: EdgeProps<ForensicsAnnotatedEdgeData>) => {
  const isCenterEdge = source === "C" || target === "C";
  const orientation = (data as any)?.orientation || "horizontal";
  const horizontalLabelText = [data?.totalVolume, data?.lastActive]
    .filter(Boolean)
    .join(" • ");
  const labelWidth = clamp(horizontalLabelText.length * 7.2 + 32, 140, 360);
  let path = "";
  let labelX = 0;
  let labelY = 0;

  let diagX = 0;
  let diagY = 0;
  let diagAngle = 0;

  if (isCenterEdge) {
    const bendFactor = 0.45;
    const centerX = source === "C" ? sourceX : targetX;
    const centerY = source === "C" ? sourceY : targetY;
    const otherX = source === "C" ? targetX : sourceX;
    const otherY = source === "C" ? targetY : sourceY;

    if (orientation === "vertical") {
      const bendY = centerY + (otherY - centerY) * bendFactor;
      const bendX = otherX;

      diagX = centerX + (bendX - centerX) * 0.38;
      diagY = centerY + (bendY - centerY) * 0.38;

      const dx = bendX - centerX;
      const dy = bendY - centerY;
      diagAngle = (Math.atan2(dy, dx) * 180) / Math.PI;

      if (diagAngle > 90) diagAngle -= 180;
      if (diagAngle < -90) diagAngle += 180;

      if (source === "C") {
        path = `M${centerX},${centerY} L${bendX},${bendY} L${otherX},${otherY}`;
        labelX = otherX + 10;
        labelY = (bendY + otherY) / 2;
      } else {
        path = `M${otherX},${otherY} L${bendX},${bendY} L${centerX},${centerY}`;
        labelX = otherX + 10;
        labelY = (bendY + otherY) / 2;
      }
    } else {
      const totalDx = Math.abs(otherX - centerX);
      const horizontalSegment = clamp(
        estimateHorizontalRunway(horizontalLabelText),
        120,
        Math.max(120, totalDx - 90),
      );
      const runwayStartX =
        source === "C"
          ? otherX - horizontalSegment
          : otherX + horizontalSegment;
      const curvePull = clamp(totalDx * 0.12, 70, 140);

      diagX = centerX + (runwayStartX - centerX) * 0.34;
      diagY = centerY + (otherY - centerY) * 0.34;

      const dx = runwayStartX - centerX;
      const dy = otherY - centerY;
      diagAngle = (Math.atan2(dy, dx) * 180) / Math.PI;

      if (diagAngle > 90) diagAngle -= 180;
      if (diagAngle < -90) diagAngle += 180;

      if (source === "C") {
        path = `M${centerX},${centerY} C${centerX + curvePull},${centerY} ${runwayStartX - curvePull},${otherY} ${runwayStartX},${otherY} L${otherX},${otherY}`;
        labelX = (runwayStartX + otherX) / 2;
        labelY = otherY - 10;
      } else {
        path = `M${otherX},${otherY} L${runwayStartX},${otherY} C${runwayStartX + curvePull},${otherY} ${centerX - curvePull},${centerY} ${centerX},${centerY}`;
        labelX = (otherX + runwayStartX) / 2;
        labelY = otherY - 10;
      }
    }
  } else {
    [path, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });
    diagX = labelX;
    diagY = labelY - 30;
    diagAngle = 0;
  }

  const isActive = data?.isActive;
  const isOutgoing = source === "C";

  return (
    <>
      {/* Main path - dark elegant styling */}
      <path
        id={id}
        className="react-flow__edge-path"
        d={path}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: isActive ? "url(#activeEdgeDarkGradient)" : style?.stroke,
          strokeWidth: isActive ? 3.5 : style?.strokeWidth,
          filter: isActive ? "drop-shadow(0 0 8px rgba(16, 185, 129, 0.4))" : "none",
          transition: "stroke 0.2s ease-out, stroke-width 0.2s ease-out",
        }}
      />
      
      {/* Smooth active connection flow without opacity pulsing */}
      {isActive && (
        <>
          <path
            d={path}
            fill="none"
            markerEnd={markerEnd}
            style={{
              stroke: "url(#particleFlowGradient)",
              strokeWidth: 2.5,
              strokeLinecap: "round",
              strokeDasharray: "6 18",
              animation: "smoothFlow 1.8s linear infinite",
              opacity: 0.78,
            }}
          />
          <path
            d={path}
            fill="none"
            style={{
              stroke: isOutgoing ? "rgba(16, 185, 129, 0.6)" : "rgba(245, 158, 11, 0.5)",
              strokeWidth: 6,
              strokeLinecap: "round",
              strokeDasharray: "1 20",
              animation: "smoothFlow 2.6s linear infinite",
              filter: "blur(3px)",
              opacity: 0.32,
            }}
          />
          <path
            d={path}
            fill="none"
            style={{
              stroke: "rgba(255,255,255,0.72)",
              strokeWidth: 1.4,
              strokeLinecap: "round",
              strokeDasharray: "2 32",
              animation: "smoothFlow 1.15s linear infinite",
              opacity: 0.46,
            }}
          />
        </>
      )}
      
      {data?.miniLabel && (
        <foreignObject
          width={400}
          height={100}
          transform={`translate(${diagX}, ${diagY}) rotate(${diagAngle}) translate(-200, -50)`}
          style={{ pointerEvents: "auto" }}
        >
          <div
            className="diagnostic-pill"
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              role="button"
              tabIndex={0}
              className="diagonal-label-pill"
              onClick={(e) => {
                e.stopPropagation();
                const targetId =
                  data.labelTargetId || (source === "C" ? target : source);
                data.onLabelClick?.(targetId);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  const targetId =
                    data.labelTargetId || (source === "C" ? target : source);
                  data.onLabelClick?.(targetId);
                }
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                background: "linear-gradient(135deg, rgba(11,23,57,0.98), rgba(5,15,35,0.98))",
                border: "1.2px solid rgba(57,200,166,0.7)",
                borderRadius: "20px",
                padding: "4px 14px",
                boxShadow: "0 4px 20px rgba(0,0,0,0.5), 0 0 12px rgba(57,200,166,0.3)",
                cursor: "pointer",
                backdropFilter: "blur(8px)",
                fontSize: "11px",
                fontWeight: "600",
                letterSpacing: "0.5px",
                color: "#39c8a6",
              }}
            >
              <Zap size={10} className="text-emerald-400" />
              {data.miniLabel}
            </div>
          </div>
        </foreignObject>
      )}
      {(data?.totalVolume || data?.lastActive) && (
        <foreignObject
          x={labelX - labelWidth / 2}
          y={labelY - 28}
          width={labelWidth}
          height={56}
          style={{ pointerEvents: "auto" }}
        >
          <div
            className="edge-label-container"
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              role="button"
              tabIndex={0}
              className="edge-mini-node"
              onClick={(e) => {
                e.stopPropagation();
                const targetId =
                  data.labelTargetId || (source === "C" ? target : source);
                data.onLabelClick?.(targetId);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  const targetId =
                    data.labelTargetId || (source === "C" ? target : source);
                  data.onLabelClick?.(targetId);
                }
              }}
              style={{
                background: "linear-gradient(135deg, rgba(10,20,40,0.95), rgba(5,12,25,0.95))",
                border: "1px solid rgba(57,200,166,0.4)",
                borderRadius: "24px",
                padding: "6px 16px",
                backdropFilter: "blur(12px)",
                cursor: "pointer",
                transition: "all 0.2s ease",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "11px",
                fontWeight: "500",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#39c8a6";
                e.currentTarget.style.boxShadow = "0 0 16px rgba(57,200,166,0.3)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(57,200,166,0.4)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <Activity size={12} className="text-emerald-400" />
              {data.totalVolume && (
                <span className={data.totalVolumeColor} style={{ fontWeight: "600" }}>
                  {data.totalVolume}
                </span>
              )}
              {data.totalVolume && data.lastActive && (
                <span className="mx-1 opacity-40">•</span>
              )}
              {data.lastActive && (
                <span className="scale-95 text-gray-300">{data.lastActive}</span>
              )}
            </div>
          </div>
        </foreignObject>
      )}
    </>
  );
};
const AnnotatedEdge = memo(
  AnnotatedEdgeBase,
  (prev, next) =>
    prev.sourceX === next.sourceX &&
    prev.targetX === next.targetX &&
    prev.sourceY === next.sourceY &&
    prev.targetY === next.targetY &&
    prev.data?.miniLabel === next.data?.miniLabel &&
    prev.data?.isActive === next.data?.isActive &&
    prev.style?.opacity === next.style?.opacity,
);

const NodeCardBase = ({
  address,
  nodeType,
  volume,
  volumeColor,
  tokenImageUrl,
  onSelect,
  onNavigate,
  onExplore,
  selected = false,
  loading = false,
}: {
  address: string;
  nodeType: ForensicsAddressKind;
  volume?: string;
  volumeColor?: string;
  tokenImageUrl?: string;
  onSelect?: () => void;
  onNavigate?: (address: string, type: ForensicsAddressKind) => void;
  onExplore?: (address: string) => void;
  selected?: boolean;
  loading?: boolean;
}) => {
  const [copied, setCopied] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

  const stopPropagation = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
    },
    [],
  );

  const stopPointerPropagation = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
    },
    [],
  );

  const handleCopy = useCallback(
    async (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (!address || !navigator?.clipboard) return;
      try {
        await navigator.clipboard.writeText(address);
        setCopied(true);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setCopied(false), 1400);
      } catch {
        setCopied(false);
      }
    },
    [address],
  );

  const handleNavigate = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onNavigate?.(address, nodeType);
    },
    [address, nodeType, onNavigate],
  );

  const handleExplore = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onExplore?.(address);
    },
    [address, onExplore],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      pointerStartRef.current = { x: event.clientX, y: event.clientY };
    },
    [],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const start = pointerStartRef.current;
      pointerStartRef.current = null;
      if (!start) return;

      const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (distance <= 6) {
        onSelect?.();
      }
    },
    [onSelect],
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const truncatedAddress = useMemo(() => {
    if (!address) return "Unknown";
    const hotWallet = getHotWalletInfo(address);
    if (hotWallet) return hotWallet.label;
    if (address.length <= 18) return address;
    return `${address.slice(0, 8)}...${address.slice(-6)}`;
  }, [address]);

  return (
    <div 
      className="forensics-node-card"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onClick={(event) => {
        event.stopPropagation();
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        transform: isHovered ? "translateY(-2px)" : "translateY(0)",
        transition: "all 0.25s cubic-bezier(0.2, 0.9, 0.4, 1.1)",
        boxShadow: selected 
          ? "0 0 0 2px rgba(57,200,166,0.5), 0 8px 32px rgba(57,200,166,0.2)" 
          : isHovered 
            ? "0 8px 32px rgba(0,0,0,0.3), 0 0 20px rgba(57,200,166,0.15)" 
            : "0 4px 16px rgba(0,0,0,0.2)",
      }}
    >
      <div className="forensics-node-top-row">
        <div className="forensics-node-address-block">
          <div className="forensics-node-address-row">
            <span
              className="forensics-node-address-line"
              title={truncatedAddress}
              style={{
                display: "block",
                minWidth: 0,
                maxWidth: "150px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {truncatedAddress}
            </span>
            <span
              className={`forensics-node-kind ${
                nodeType === "contract"
                  ? "forensics-node-kind-contract"
                  : "forensics-node-kind-wallet"
              }`}
            >
              {nodeType === "contract" ? "📜 CONTRACT" : "👛 WALLET"}
            </span>
          </div>
          <div className="forensics-node-volume-line">
            {loading ? (
              <div className="h-3.5 w-24 bg-white/10 rounded animate-pulse mt-0.5" />
            ) : (
              <>
                {tokenImageUrl ? (
                  <Image
                    src={tokenImageUrl}
                    alt=""
                    width={16}
                    height={16}
                    className="mr-1 inline-block h-4 w-4 rounded-full object-cover align-[-2px]"
                    loading="lazy"
                  />
                ) : (
                  <TrendingUp size={12} className="inline mr-1 text-emerald-400" />
                )}
                <span className={volumeColor || "text-gray-300"}>
                  {volume || "Volume unavailable"}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="forensics-node-address-actions">
          <button
            type="button"
            className="forensics-node-copy nodrag nopan inline-flex"
            onClick={handleCopy}
            onMouseDown={stopPropagation}
            onPointerDown={stopPointerPropagation}
            title={copied ? "Copied" : "Copy address"}
            style={{
              background: copied ? "rgba(57,200,166,0.2)" : "transparent",
            }}
          >
            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
          </button>
          <button
            type="button"
            className="forensics-node-info nodrag nopan inline-flex"
            onClick={handleExplore}
            onMouseDown={stopPropagation}
            onPointerDown={stopPointerPropagation}
            title="Explore this address"
          >
            <Eye size={14} />
          </button>
          <button
            type="button"
            className="forensics-node-info nodrag nopan inline-flex"
            onClick={handleNavigate}
            onMouseDown={stopPropagation}
            onPointerDown={stopPointerPropagation}
            title="Open address page"
          >
            <FaExternalLinkAlt size={12} />
          </button>
        </div>
      </div>
      <div className="forensics-node-address-full" title={address}>
        {address}
      </div>
      {selected && (
        <div className="absolute -top-1 -right-1">
          <Sparkles size={16} className="text-emerald-400" />
        </div>
      )}
    </div>
  );
};
const NodeCard = memo(NodeCardBase);

interface ForensicsNodeData {
  address: string;
  nodeType: ForensicsAddressKind;
  volume?: string;
  volumeColor?: string;
  tokenImageUrl?: string;
  onSelect?: () => void;
  onNavigate?: (address: string, type: ForensicsAddressKind) => void;
  onExplore?: (address: string) => void;
  isSelected?: boolean;
  loading?: boolean;
  targetPosition?: Position;
  sourcePosition?: Position;
}

const ForensicsNodeBase = ({
  data,
  selected,
}: NodeProps<ForensicsNodeData>) => {
  return (
    <>
      <Handle
        type="target"
        position={data.targetPosition || Position.Left}
        style={{ opacity: 0 }}
      />
      <NodeCard
        address={data.address}
        nodeType={data.nodeType}
        volume={data.volume}
        volumeColor={data.volumeColor}
        tokenImageUrl={data.tokenImageUrl}
        onSelect={data.onSelect}
        onNavigate={data.onNavigate}
        onExplore={data.onExplore}
        selected={selected || data.isSelected}
        loading={data.loading}
      />
      <Handle
        type="source"
        position={data.sourcePosition || Position.Right}
        style={{ opacity: 0 }}
      />
    </>
  );
};
const ForensicsNode = memo(ForensicsNodeBase);

interface ShowMoreNodeData {
  count: number;
  onExpand?: () => void;
}

function ShowMoreNodeBase({ data }: NodeProps<ShowMoreNodeData>) {
  const [isHovered, setIsHovered] = useState(false);
  
  return (
    <button
      className="show-more-node"
      onClick={(event) => {
        event.stopPropagation();
        data.onExpand?.();
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        background: isHovered 
          ? "linear-gradient(135deg, rgba(57,200,166,0.15), rgba(250,78,48,0.08))" 
          : "rgba(250,78,48,0.07)",
        border: isHovered 
          ? "1.5px solid rgba(57,200,166,0.7)" 
          : "1.5px dashed rgba(250,78,48,0.4)",
        transition: "all 0.2s ease",
        transform: isHovered ? "scale(1.02)" : "scale(1)",
      }}
    >
      <Sparkles size={14} className="inline mr-2" style={{ opacity: isHovered ? 1 : 0.6 }} />
      +{data.count} more entities
    </button>
  );
}
const ShowMoreNode = memo(ShowMoreNodeBase);

function formatLabel(primary?: string, fallback?: string) {
  const candidate = primary?.trim() || fallback?.trim();
  return candidate || "anonymous";
}

function ForensicsCanvas({
  centerLabel,
  senderAccounts,
  recipientAccounts,
  loading,
  overlayMessage,
  onNodeClick,
  getNodeId,
  onCanvasClick,
  onExploreAddress,
}: ForensicsCanvasProps) {
  const router = useRouter();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node[]>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>([]);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [expandedLeft, setExpandedLeft] = useState(false);
  const [expandedRight, setExpandedRight] = useState(false);
  const edgeTypes = useMemo(
    () => ({
      annotatedEdge: AnnotatedEdge,
    }),
    [],
  );
  const nodeTypes = useMemo(
    () => ({
      forensicsNode: ForensicsNode,
      showMoreNode: ShowMoreNode,
    }),
    [],
  );

  // Use refs to prevent unnecessary re-renders and flickering
  const activeNodeIdRef = useRef(activeNodeId);
  const updateFrameRef = useRef<number | null>(null);
  const suppressNodeClickUntil = useRef(0);

  const setActiveSelection = useCallback((nodeId: string | null) => {
    activeNodeIdRef.current = nodeId;
    setActiveNodeId(nodeId);
  }, []);

  useEffect(() => {
    activeNodeIdRef.current = activeNodeId;
  }, [activeNodeId]);

  const navigateToAddress = useCallback(
    (addressValue: string, addressType: ForensicsAddressKind) => {
      const normalized = addressValue.trim();
      if (!normalized) return;
      const target = normalized;
      const path =
        addressType === "contract"
          ? `https://zigscan.org/smart-contracts/contract/${target}`
          : `https://zigscan.org/address/${target}`;
      if (typeof window !== "undefined") {
        window.open(path, "_blank", "noopener,noreferrer");
      } else {
        router.push(path);
      }
    },
    [router],
  );

  const handleLabelClick = useCallback(
    (nodeId: string) => {
      if (!nodeId) return;
      setActiveSelection(nodeId);
      onNodeClick?.(nodeId);
    },
    [onNodeClick, setActiveSelection],
  );

  const handleNodeSelect = useCallback(
    (nodeId: string) => {
      if (!nodeId || Date.now() < suppressNodeClickUntil.current) return;
      setActiveSelection(nodeId);
      onNodeClick?.(nodeId === "C" ? centerLabel : nodeId);
    },
    [centerLabel, onNodeClick, setActiveSelection],
  );

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setIsMobile(window.innerWidth < 1024), 150);
    };
    update();
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    setExpandedLeft(false);
    setExpandedRight(false);
    setActiveSelection(null);
  }, [centerLabel, setActiveSelection]);

  const [isLocked, setIsLocked] = useState(false);

  const layout = useMemo(() => {
    const resolveNodeId = (
      side: "L" | "R",
      group: CounterpartyGroup,
      idx: number,
    ) =>
      getNodeId
        ? getNodeId(side, group, idx)
        : `${side}-${group.address}-${idx}`;

    const visibleSenders = expandedLeft
      ? senderAccounts
      : senderAccounts.slice(0, VISIBLE_LIMIT);
    const visibleRecipients = expandedRight
      ? recipientAccounts
      : recipientAccounts.slice(0, VISIBLE_LIMIT);
    
    const hiddenLeftCount = Math.max(
      senderAccounts.length - visibleSenders.length,
      0,
    );
    const hiddenRightCount = Math.max(
      recipientAccounts.length - visibleRecipients.length,
      0,
    );
    
    const leftCount = visibleSenders.length + (hiddenLeftCount > 0 ? 1 : 0);
    const rightCount = visibleRecipients.length + (hiddenRightCount > 0 ? 1 : 0);
    const isAnyExpanded = expandedLeft || expandedRight;
    
    const nodeWidth = isMobile ? 280 : 320;
    const baseDistance = isMobile ? 480 : 700;
    const maxNodesPerSide = Math.max(visibleSenders.length, visibleRecipients.length);
    const dynamicDistance = isAnyExpanded 
      ? Math.max(baseDistance, Math.min(1200, baseDistance + (maxNodesPerSide - 8) * 35))
      : baseDistance;
    
    const distance = dynamicDistance;
    const nodeHeight = 110;
    const dynamicRowGap = isAnyExpanded ? 24 : 18;
    const totalHeightNeeded = maxNodesPerSide * (nodeHeight + dynamicRowGap);
    const verticalCenterOffset = -totalHeightNeeded / 2 + 60;
    
    const nodeBandHeight = isMobile ? 180 : isAnyExpanded ? 130 : 190;
    const sentinelBandHeight = 92;
    const rowGap = isMobile ? 28 : dynamicRowGap;
    const maxRowsPerColumn = Number.POSITIVE_INFINITY;
    
    const sideOutwardOffset = (groups: CounterpartyGroup[]) => {
      if (isMobile) return 0;
      const maxRunway = groups.reduce((max, group) => {
        const runway = estimateHorizontalRunway(
          group.edgeTimeRange || group.lastActiveFormatted,
        );
        return Math.max(max, runway);
      }, 180);
      return Math.max(0, maxRunway - 180);
    };
    
    const buildColumnRunways = (groups: CounterpartyGroup[]) => {
      if (isMobile) return [];
      const runways: number[] = [];
      for (let start = 0; start < groups.length; start += maxRowsPerColumn) {
        const columnGroups = groups.slice(start, start + maxRowsPerColumn);
        const maxRunway = columnGroups.reduce((max, group) => {
          const runway = estimateHorizontalRunway(
            group.edgeTimeRange || group.lastActiveFormatted,
          );
          return Math.max(max, runway);
        }, 180);
        runways.push(maxRunway);
      }
      return runways;
    };
    
    const leftColumnOffset = sideOutwardOffset(visibleSenders);
    const rightColumnOffset = sideOutwardOffset(visibleRecipients);
    const leftColumnRunways = buildColumnRunways(visibleSenders);
    const rightColumnRunways = buildColumnRunways(visibleRecipients);
    
    const buildDesktopSideLayout = (
      items: Array<
        | { kind: "group"; group: CounterpartyGroup; idx: number }
        | { kind: "sentinel"; count: number }
      >,
      side: "L" | "R",
      baseColumnOffset: number,
      columnRunways: number[],
    ) => {
      if (isMobile) return [];

      const positioned: Array<
        (
          | { kind: "group"; group: CounterpartyGroup; idx: number }
          | { kind: "sentinel"; count: number }
        ) & {
          x: number;
          y: number;
        }
      > = [];

      for (
        let start = 0, columnIndex = 0;
        start < items.length;
        start += maxRowsPerColumn, columnIndex += 1
      ) {
        const columnItems = items.slice(start, start + maxRowsPerColumn);
        const footprints = columnItems.map((item) =>
          item.kind === "sentinel" ? sentinelBandHeight : nodeBandHeight,
        );
        const offsets = buildCenteredOffsets(footprints, rowGap);
        const accumulatedColumnsWidth = columnRunways
          .slice(0, columnIndex)
          .reduce((sum, runway) => sum + nodeWidth + runway + 80, 0);
        const x =
          side === "L"
            ? -(distance + baseColumnOffset + accumulatedColumnsWidth)
            : distance + baseColumnOffset + accumulatedColumnsWidth;

        columnItems.forEach((item, rowIndex) => {
          positioned.push({
            ...item,
            x,
            y: (offsets[rowIndex] ?? 0) + verticalCenterOffset,
          });
        });
      }

      return positioned;
    };

    const leftDesktopLayout = buildDesktopSideLayout(
      [
        ...visibleSenders.map((group, idx) => ({
          kind: "group" as const,
          group,
          idx,
        })),
        ...(hiddenLeftCount > 0
          ? [{ kind: "sentinel" as const, count: hiddenLeftCount }]
          : []),
      ],
      "L",
      leftColumnOffset,
      leftColumnRunways,
    );
    const rightDesktopLayout = buildDesktopSideLayout(
      [
        ...visibleRecipients.map((group, idx) => ({
          kind: "group" as const,
          group,
          idx,
        })),
        ...(hiddenRightCount > 0
          ? [{ kind: "sentinel" as const, count: hiddenRightCount }]
          : []),
      ],
      "R",
      rightColumnOffset,
      rightColumnRunways,
    );

    const baseNodeStyle = {
      padding: 0,
      background: "transparent",
      border: "none",
      boxShadow: "none",
      cursor: "pointer",
    };

    const currentActiveId = activeNodeIdRef.current;

    const leftNodes: Node[] = visibleSenders.map((group, idx) => {
      const labelText = formatLabel(group.address);
      const nodeId = resolveNodeId("L", group, idx);
      const nodeType = detectAddressType(group.address);

      let x, y, sourcePos, targetPos;

      if (isMobile) {
        x = (idx - (leftCount - 1) / 2) * (nodeWidth + 40) * (isAnyExpanded ? 0.8 : 1);
        y = -distance + (idx % 2 === 0 ? 20 : -20);
        sourcePos = Position.Bottom;
        targetPos = Position.Top;
      } else {
        const desktopPlacement = leftDesktopLayout.find(
          (item) => item.kind === "group" && item.idx === idx,
        );
        x = desktopPlacement?.x ?? -(distance + leftColumnOffset);
        y = desktopPlacement?.y ?? 0;
        sourcePos = Position.Right;
        targetPos = Position.Left;
      }

      return {
        id: nodeId,
        position: { x, y },
        data: {
          address: labelText,
          nodeType,
          isSelected: currentActiveId === nodeId,
          volume: group.totalVolumeFormatted,
          volumeColor: group.totalVolumeColor,
          tokenImageUrl: group.tokenImageUrl,
          onSelect: () => handleNodeSelect(nodeId),
          onNavigate: navigateToAddress,
          onExplore: onExploreAddress,
          sourcePosition: sourcePos,
          targetPosition: targetPos,
          loading,
        },
        style: { width: nodeWidth, ...baseNodeStyle },
        sourcePosition: sourcePos,
        targetPosition: targetPos,
        className: `forensics-node ${currentActiveId === nodeId ? "forensics-node-selected" : ""}`,
        type: "forensicsNode",
      };
    });

    if (hiddenLeftCount > 0) {
      const leftSentinelPlacement = leftDesktopLayout.find(
        (item) => item.kind === "sentinel",
      );
      leftNodes.push({
        id: "SHOW_MORE_L",
        type: "showMoreNode",
        position: isMobile
          ? {
              x: (leftNodes.length - (leftCount - 1) / 2) * (nodeWidth + 40),
              y: -distance,
            }
          : {
              x: leftSentinelPlacement?.x ?? -(distance + leftColumnOffset),
              y: leftSentinelPlacement?.y ?? 0,
            },
        data: { count: hiddenLeftCount, onExpand: () => setExpandedLeft(true) },
        sourcePosition: isMobile ? Position.Bottom : Position.Right,
        targetPosition: isMobile ? Position.Top : Position.Left,
      });
    }

    const rightNodes: Node[] = visibleRecipients.map((group, idx) => {
      const labelText = formatLabel(group.address);
      const nodeId = resolveNodeId("R", group, idx);
      const nodeType = detectAddressType(group.address);

      let x, y, sourcePos, targetPos;

      if (isMobile) {
        x = (idx - (rightCount - 1) / 2) * (nodeWidth + 40) * (isAnyExpanded ? 0.8 : 1);
        y = distance + (idx % 2 === 0 ? -20 : 20);
        sourcePos = Position.Top;
        targetPos = Position.Top;
      } else {
        const desktopPlacement = rightDesktopLayout.find(
          (item) => item.kind === "group" && item.idx === idx,
        );
        x = desktopPlacement?.x ?? distance + rightColumnOffset;
        y = desktopPlacement?.y ?? 0;
        sourcePos = Position.Left;
        targetPos = Position.Left;
      }

      return {
        id: nodeId,
        position: { x, y },
        data: {
          address: labelText,
          nodeType,
          isSelected: currentActiveId === nodeId,
          volume: group.totalVolumeFormatted,
          volumeColor: group.totalVolumeColor,
          tokenImageUrl: group.tokenImageUrl,
          onSelect: () => handleNodeSelect(nodeId),
          onNavigate: navigateToAddress,
          onExplore: onExploreAddress,
          sourcePosition: sourcePos,
          targetPosition: targetPos,
          loading,
        },
        style: { width: nodeWidth, ...baseNodeStyle },
        targetPosition: targetPos,
        sourcePosition: sourcePos,
        className: `forensics-node ${currentActiveId === nodeId ? "forensics-node-selected" : ""}`,
        type: "forensicsNode",
      };
    });

    if (hiddenRightCount > 0) {
      const rightSentinelPlacement = rightDesktopLayout.find(
        (item) => item.kind === "sentinel",
      );
      rightNodes.push({
        id: "SHOW_MORE_R",
        type: "showMoreNode",
        position: isMobile
          ? {
              x: (rightNodes.length - (rightCount - 1) / 2) * (nodeWidth + 40),
              y: distance,
            }
          : {
              x: rightSentinelPlacement?.x ?? distance + rightColumnOffset,
              y: rightSentinelPlacement?.y ?? 0,
            },
        data: {
          count: hiddenRightCount,
          onExpand: () => setExpandedRight(true),
        },
        sourcePosition: isMobile ? Position.Top : Position.Left,
        targetPosition: isMobile ? Position.Top : Position.Left,
      });
    }

    const centerLabelText = centerLabel?.trim() || "Address";
    const centerNodeType = detectAddressType(centerLabelText);
    const centerNode: Node = {
      id: "C",
      position: { x: 0, y: verticalCenterOffset },
      data: {
        address: centerLabelText,
        nodeType: centerNodeType,
        isSelected: currentActiveId === "C",
        volume: "Central Hub",
        volumeColor: "text-emerald-400",
        onSelect: () => handleNodeSelect("C"),
        onNavigate: navigateToAddress,
        onExplore: onExploreAddress,
        sourcePosition: isMobile ? Position.Bottom : Position.Right,
        targetPosition: isMobile ? Position.Top : Position.Left,
        loading,
      },
      style: { width: nodeWidth, ...baseNodeStyle },
      sourcePosition: isMobile ? Position.Bottom : Position.Right,
      targetPosition: isMobile ? Position.Top : Position.Left,
      className: `forensics-node ${currentActiveId === "C" ? "forensics-node-selected" : ""}`,
      type: "forensicsNode",
    };

    const leftEdges: Edge[] = visibleSenders.map((group, idx) => {
      const nodeId = resolveNodeId("L", group, idx);
      return {
        id: `e-${nodeId}-C`,
        source: nodeId,
        target: "C",
        type: "annotatedEdge",
        animated: false,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: {
          opacity: 1,
          stroke: "rgba(57,200,166,0.6)",
        },
        data: {
          miniLabel: formatEdgeSummary(group.transactions.length, "received"),
          totalVolume: group.edgeTimeRange || group.lastActiveFormatted,
          totalVolumeColor: "text-emerald-300",
          lastActive: null,
          isActive: false,
          labelTargetId: nodeId,
          onLabelClick: handleLabelClick,
          orientation: isMobile ? "vertical" : "horizontal",
        },
      };
    });

    const rightEdges: Edge[] = visibleRecipients.map((group, idx) => {
      const nodeId = resolveNodeId("R", group, idx);
      return {
        id: `e-C-${nodeId}`,
        source: "C",
        target: nodeId,
        type: "annotatedEdge",
        animated: false,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: {
          opacity: 1,
          stroke: "rgba(245,158,11,0.6)",
        },
        data: {
          miniLabel: formatEdgeSummary(group.transactions.length, "sent"),
          totalVolume: group.edgeTimeRange || group.lastActiveFormatted,
          totalVolumeColor: "text-emerald-300",
          lastActive: null,
          isActive: false,
          labelTargetId: nodeId,
          onLabelClick: handleLabelClick,
          orientation: isMobile ? "vertical" : "horizontal",
        },
      };
    });

    return {
      nodes: [...leftNodes, centerNode, ...rightNodes],
      edges: [...leftEdges, ...rightEdges],
    };
  }, [
    centerLabel,
    senderAccounts,
    recipientAccounts,
    getNodeId,
    navigateToAddress,
    handleLabelClick,
    handleNodeSelect,
    isMobile,
    onExploreAddress,
    expandedLeft,
    expandedRight,
    loading,
  ]);

  const lastFittedLabel = useRef<string | null>(null);
  const lastFittedNodeCount = useRef<number>(0);
  const lastLayoutSignature = useRef<string>("");
  const isNodeDragInProgress = useRef(false);
  const layoutSignature = useMemo(
    () =>
      layout.nodes
        .map(
          (node) =>
            `${node.id}:${Math.round(node.position.x)}:${Math.round(node.position.y)}`,
        )
        .join("|"),
    [layout.nodes],
  );

  // Optimized node/edge updates without flickering
  const updateActiveConnections = useCallback(() => {
    const currentActiveId = activeNodeIdRef.current;
    const shouldAnimate = edges.length <= MAX_ANIMATED_EDGES;

    // Batch node updates
    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.type !== "forensicsNode") return node;
        const selected = currentActiveId === node.id;
        return {
          ...node,
          selected,
          data: { ...node.data, isSelected: selected },
          className: selected ? "forensics-node forensics-node-selected" : "forensics-node",
        };
      })
    );

    // Batch edge updates
    setEdges((currentEdges) =>
      currentEdges.map((edge) => {
        const hasActive = Boolean(currentActiveId);
        const isCenterActive = currentActiveId === "C";
        // C clicked → ALL edges active; side node clicked → only its edges active
        const isConnected = hasActive && (
          isCenterActive ||
          edge.source === currentActiveId ||
          edge.target === currentActiveId
        );
        const isOutgoing = edge.source === "C";
        const baseStroke = isOutgoing ? "rgba(245,158,11,0.6)" : "rgba(57,200,166,0.6)";
        const activeStroke = isOutgoing ? "#10b981" : "#f59e0b";
        const activeGlow = isOutgoing ? "0 0 8px rgba(16,185,129,0.4)" : "0 0 8px rgba(245,158,11,0.3)";

        return {
          ...edge,
          animated: shouldAnimate && isConnected,
          style: {
            ...edge.style,
            opacity: hasActive && !isCenterActive && !isConnected ? 0.25 : 1,
            stroke: isConnected ? activeStroke : baseStroke,
            filter: isConnected ? activeGlow : "none",
          },
          data: {
            ...edge.data,
            isActive: isConnected,
          },
        };
      }) as Edge[]
    );
  }, [edges.length, setNodes, setEdges]);

  // Use RAF for smooth updates
  useEffect(() => {
    if (updateFrameRef.current) {
      cancelAnimationFrame(updateFrameRef.current);
    }
    updateFrameRef.current = requestAnimationFrame(() => {
      updateActiveConnections();
      updateFrameRef.current = null;
    });
    return () => {
      if (updateFrameRef.current) {
        cancelAnimationFrame(updateFrameRef.current);
      }
    };
  }, [activeNodeId, updateActiveConnections]);

  useEffect(() => {
    if (centerLabel !== lastFittedLabel.current) {
      setIsReady(false);
    }
    setNodes(layout.nodes);
    setEdges(layout.edges);
  }, [layout, setNodes, setEdges, centerLabel]);

  useEffect(() => {
    if (!rfInstance || !layout.nodes.length || isNodeDragInProgress.current) return;

    const isNewContext = centerLabel !== lastFittedLabel.current;
    const hasExpanded = layout.nodes.length > 1 && lastFittedNodeCount.current <= 1;
    const layoutChanged = layoutSignature !== lastLayoutSignature.current;

    if (isNewContext || hasExpanded || layoutChanged) {
      const frame = requestAnimationFrame(() => {
        rfInstance.fitView({
          padding: 0.24,
          includeHiddenNodes: false,
          duration: 300,
        });
        const timer = setTimeout(() => {
          setIsReady(true);
          lastFittedLabel.current = centerLabel;
          lastFittedNodeCount.current = layout.nodes.length;
          lastLayoutSignature.current = layoutSignature;
        }, 150);
        return () => clearTimeout(timer);
      });
      return () => cancelAnimationFrame(frame);
    } else {
      if (!isReady) setIsReady(true);
      lastFittedNodeCount.current = layout.nodes.length;
      lastLayoutSignature.current = layoutSignature;
    }
  }, [rfInstance, layout.nodes.length, layoutSignature, centerLabel, isReady]);

  const hasGraph = nodes.length > 0;
  const handleStableNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      if (isNodeDragInProgress.current) {
        onNodesChange(changes.filter((change) => change.type !== "select"));
        return;
      }
      onNodesChange(changes);
    },
    [onNodesChange],
  );

  return (
    <div className="relative h-full w-full overflow-hidden bg-transparent" style={{ userSelect: "none", WebkitUserSelect: "none" }}>
      {/* SVG Gradients for dark themed animated edges */}
      <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          <linearGradient id="edgeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="50%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
          
          {/* Dark themed gradient for active outgoing edges */}
          <linearGradient id="activeEdgeDarkGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="50%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
          
          {/* Particle flow gradient */}
          <linearGradient id="particleFlowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.9" />
            <stop offset="50%" stopColor="#8b5cf6" stopOpacity="1" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.9" />
          </linearGradient>
          
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.12"/>
            <stop offset="100%" stopColor="#10b981" stopOpacity="0"/>
          </radialGradient>
        </defs>
      </svg>

      {/* CSS Animations - Smooth Dark Theme */}
      <style>{`
        @keyframes smoothFlow {
          0% { stroke-dashoffset: 24; }
          100% { stroke-dashoffset: 0; }
        }
        .forensics-node-card {
          position: relative;
          user-select: none;
          -webkit-user-select: none;
        }
        .react-flow__edge-path {
          transition: stroke 0.2s ease-out, stroke-width 0.2s ease-out;
        }
        .react-flow__edge {
          pointer-events: visibleStroke;
        }
        .forensics-node-selected .forensics-node-card {
          box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.5), 0 8px 32px rgba(16, 185, 129, 0.2);
        }
      `}</style>

      {/* Ambient background glow */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full" style={{ background: "radial-gradient(circle, rgba(16,185,129,0.06) 0%, transparent 70%)" }} />
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-blue-900/5 via-transparent to-purple-900/5" />
      </div>

      {hasGraph ? (
        <div
          className="w-full h-full"
          style={{ opacity: isReady ? 1 : 0.98 }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeOrigin={[0.5, 0.5]}
            onNodesChange={handleStableNodesChange}
            onEdgesChange={onEdgesChange}
            onInit={(inst) => setRfInstance(inst)}
            onNodeClick={(_, node) => {
              handleNodeSelect(node.id);
            }}
            onNodeDragStart={() => {
              isNodeDragInProgress.current = true;
            }}
            onNodeDragStop={() => {
              isNodeDragInProgress.current = false;
              suppressNodeClickUntil.current = Date.now() + 220;
            }}
            onPaneClick={() => {
              setActiveSelection(null);
              onCanvasClick?.();
            }}
            minZoom={0.2}
            maxZoom={1.5}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            defaultEdgeOptions={{
              style: { strokeWidth: 2.5 },
              type: "annotatedEdge",
              animated: true,
            }}
            edgeTypes={edgeTypes}
            nodeTypes={nodeTypes}
            proOptions={{ hideAttribution: true }}
            nodesDraggable={!isLocked}
            nodesConnectable={!isLocked}
            elementsSelectable={!isLocked}
            selectNodesOnDrag={false}
            nodeExtent={[[-3000, -2500], [3000, 2500]]}
            translateExtent={[[-3500, -3000], [3500, 3000]]}
            elevateNodesOnSelect={false}
            defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
          >
            <MiniMap
              className="forensics-minimap"
              style={{
                backgroundColor: "rgba(5,10,25,0.8)",
                backdropFilter: "blur(12px)",
                border: "1px solid rgba(57,200,166,0.25)",
                borderRadius: "12px",
                width: isMobile ? 100 : 120,
                height: isMobile ? 70 : 90,
                boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
              }}
              nodeColor={(node) => {
                if (node.id === "C") return "#10b981";
                if (node.id.startsWith("L")) return "#3b82f6";
                return "#f59e0b";
              }}
              maskColor="rgba(57,200,166,0.08)"
            />
            <Controls
              className="forensics-flow-controls"
              showInteractive={false}
              style={
                isMobile
                  ? {
                      transform: "scale(0.8)",
                      transformOrigin: "bottom left",
                      marginBottom: 12,
                      marginLeft: 12,
                    }
                  : {}
              }
            >
              <ControlButton
                onClick={() => setIsLocked(!isLocked)}
                title={isLocked ? "Unlock Layout" : "Lock Layout"}
                style={{
                  backgroundColor: "rgba(0,0,0,0.8)",
                  border: "1px solid rgba(57,200,166,0.3)",
                  borderRadius: "8px",
                }}
              >
                {isLocked ? <Lock size={14} className="text-emerald-400" /> : <Unlock size={14} className="text-emerald-400" />}
              </ControlButton>
            </Controls>
            <Background
              variant={BackgroundVariant.Dots}
              color="rgba(57,200,166,0.25)"
              gap={20}
              size={1.5}
            />
          </ReactFlow>
        </div>
      ) : (
        <div className="h-full" />
      )}

      {overlayMessage && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center text-center px-6 z-10 animate-in fade-in duration-300">
          <div className="bg-gradient-to-br from-emerald-950/40 to-black/60 border border-emerald-500/30 rounded-2xl p-8 max-w-md backdrop-blur-xl">
            <Activity className="w-12 h-12 text-emerald-400 mx-auto mb-4 animate-pulse" />
            <div className="text-white text-sm md:text-base font-mono">{overlayMessage}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(ForensicsCanvas);
