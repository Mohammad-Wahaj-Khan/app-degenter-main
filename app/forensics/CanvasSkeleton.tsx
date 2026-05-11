"use client";

import React from "react";
import { motion } from "framer-motion";

const LEFT_ROWS = [-320, -210, -100, 10, 120, 230];
const RIGHT_ROWS = [-320, -210, -100, 10, 120, 230];

export default function CanvasSkeleton({
  progress = 0,
}: {
  progress?: number;
}) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <div
        className="absolute inset-0 opacity-35"
        style={{
          backgroundImage:
            "linear-gradient(rgba(57, 200, 166, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(57, 200, 166, 0.08) 1px, transparent 1px)",
          backgroundSize: "50px 50px",
          backgroundPosition: "center center",
        }}
      />

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(57,200,166,0.10),transparent_50%)]" />

      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative h-[760px] w-[1380px] max-w-[96vw] scale-[0.92] md:scale-100">
          <svg className="absolute inset-0 h-full w-full overflow-visible">
            <g transform="translate(690 380)">
              {LEFT_ROWS.map((row, index) => (
                <SkeletonEdge
                  key={`left-edge-${row}`}
                  startX={-88}
                  startY={0}
                  endX={-410}
                  endY={row}
                  delay={index * 0.08}
                />
              ))}
              {RIGHT_ROWS.map((row, index) => (
                <SkeletonEdge
                  key={`right-edge-${row}`}
                  startX={88}
                  startY={0}
                  endX={410}
                  endY={row}
                  delay={index * 0.08 + 0.22}
                />
              ))}
            </g>
          </svg>

          <div className="absolute inset-0">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <SkeletonNode center />
            </div>

            {LEFT_ROWS.map((row, index) => (
              <div
                key={`left-node-${row}`}
                className="absolute"
                style={{
                  left: "14%",
                  top: `calc(50% + ${row}px)`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <SkeletonNode delay={index * 0.08} />
              </div>
            ))}

            {RIGHT_ROWS.map((row, index) => (
              <div
                key={`right-node-${row}`}
                className="absolute"
                style={{
                  left: "86%",
                  top: `calc(50% + ${row}px)`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <SkeletonNode delay={index * 0.08 + 0.22} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SkeletonNode({
  center = false,
  delay = 0,
}: {
  center?: boolean;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0.45 }}
      animate={{ opacity: [0.35, 0.68, 0.35] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut", delay }}
      className={`rounded-lg border border-[#1b6f5c] bg-black/80 backdrop-blur-xl shadow-[0_0_28px_rgba(57,200,166,0.08)] ${
        center ? "h-[76px] w-[168px]" : "h-[74px] w-[176px] md:w-[196px]"
      }`}
    >
      <div className="flex h-full items-center gap-3 px-4">
        <div className="h-8 w-8 rounded-full bg-[#123b32]" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-24 rounded-full bg-[#123b32]" />
          <div className="h-2.5 w-16 rounded-full bg-[#0d2b25]" />
          {!center ? (
            <div className="h-2 w-28 rounded-full bg-[#0a221e]" />
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}

function SkeletonEdge({
  startX,
  startY,
  endX,
  endY,
  delay,
}: {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  delay: number;
}) {
  const bendFactor = 0.45;
  const runwayLength = 170;
  const runwayStartX =
    endX < startX ? endX + runwayLength : endX - runwayLength;
  const path =
    endX > startX
      ? `M${startX},${startY} C${startX + 70},${startY} ${runwayStartX - 80},${endY} ${runwayStartX},${endY} L${endX},${endY}`
      : `M${endX},${endY} L${runwayStartX},${endY} C${runwayStartX + 80},${endY} ${startX - 70},${startY} ${startX},${startY}`;
  const labelX = (runwayStartX + endX) / 2;
  const labelY = endY - 12;

  return (
    <>
      <path
        d={path}
        fill="none"
        stroke="rgba(57, 200, 166, 0.18)"
        strokeWidth="1.4"
      />
      <motion.path
        d={path}
        fill="none"
        stroke="rgba(57, 200, 166, 0.44)"
        strokeWidth="1.8"
        strokeLinecap="round"
        initial={{ pathLength: 0.1, opacity: 0.15 }}
        animate={{
          pathLength: [0.12, 0.42, 0.12],
          opacity: [0.12, 0.38, 0.12],
        }}
        transition={{
          duration: 2.2,
          repeat: Infinity,
          ease: "easeInOut",
          delay,
        }}
      />
      <rect
        x={labelX - 46}
        y={labelY - 10}
        width="92"
        height="18"
        rx="6"
        fill="rgba(0, 0, 0, 0.88)"
        stroke="rgba(57, 200, 166, 0.32)"
      />
    </>
  );
}
