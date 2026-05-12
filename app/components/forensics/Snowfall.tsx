"use client";

import React, { useEffect, useState } from "react";

export default function Snowfall() {
  const [snowElements, setSnowElements] = useState<
    Array<{ id: number; style: React.CSSProperties }>
  >([]);

  useEffect(() => {
    const newElements = Array.from({ length: 150 }).map((_, i) => {
      const size = Math.random() * 3 + 1.5;
      const duration = Math.random() * 25 + 12;
      return {
        id: i,
        style: {
          left: `${Math.random() * 100}%`,
          animationDelay: `-${Math.random() * duration}s`,
          animationDuration: `${duration}s`,
          opacity: Math.random() * 0.4 + 0.1,
          width: `${size}px`,
          height: `${size}px`,
          boxShadow: `0 0 ${size * 2}px rgba(4, 183, 248, 0.8)`,
        },
      };
    });
    setSnowElements(newElements);
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
      <style jsx>{`
        @keyframes snowfall {
          0% {
            transform: translateY(-10px) translateX(0);
          }
          100% {
            transform: translateY(100vh) translateX(20px);
          }
        }
        .snowflake {
          position: absolute;
          top: -10px;
          background-color: #04b7f8;
          border-radius: 50%;
          animation-name: snowfall;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
      `}</style>
      {snowElements.map((flake) => (
        <div key={flake.id} className="snowflake" style={flake.style} />
      ))}
    </div>
  );
}
