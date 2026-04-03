'use client';

import React, { useEffect, useRef } from 'react';

export default function Custom404() {
  const lightRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMove(e: MouseEvent | TouchEvent) {
      const clientX = 'touches' in e ? (e.touches[0].clientX) : e.clientX;
      const clientY = 'touches' in e ? (e.touches[0].clientY) : e.clientY;
      if (!lightRef.current || !textRef.current) return;

      lightRef.current.style.left = clientX + 'px';
      lightRef.current.style.top = clientY + 'px';

      const rect = textRef.current.getBoundingClientRect();
      const textCenterX = rect.left + rect.width / 2;
      const textCenterY = rect.top + rect.height / 2;
      const dx = clientX - textCenterX;
      const dy = clientY - textCenterY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const brightness = Math.max(0.3, 1 - distance / 500);
      // you may adjust the RGBA or color for better effect
      textRef.current.style.color = `rgba(255, 255, 255, ${brightness})`;
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });

    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('touchmove', onMove);
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-black relative overflow-hidden">


      <div
        className="absolute inset-0 z-1 h-60 wrapper"
        style={{
          backgroundImage: `
            linear-gradient(
              120deg,
              #14624F 0%,
              #39C8A6 36.7%,
              #FA4E30 66.8%,
              #2D1B45 100%
            )
          `,
          backgroundSize: "cover",
          backgroundRepeat: "no-repeat",
          backgroundBlendMode: "multiply",
          // filter: "saturate(85%) brightness(1.6)",
        }}>
        <div className="container">
          <div className="text-404" ref={textRef}>404</div>
          <div className="message">Looks like you’re lost — the page you’re looking for isn’t available!</div>
          <a href="/" className="link_404">Back to Home</a>
        </div>
        <div className="light" ref={lightRef}></div>
        <style jsx>{`
        .wrapper {
          margin: 0;
          padding: 0;
          height: 100vh;
          overflow: hidden;
          display: flex;
          justify-content: center;
          align-items: center;
          position: relative;
          color: #fff;
        }
        .container {
          position: relative;
          text-align: center;
          padding: 0 20px;
        }
        .text-404 {
          font-size: 10rem;
          /* Use a funky handwriting or cursive font — you can load custom font via global css or @import */
          font-family: 'Comic Neue', 'Pacifico', cursive, sans-serif;
          user-select: none;
          /* fallback color; color will be updated via JS on move */
          color: rgba(255,255,255,1);
          text-shadow: 0 0 10px rgba(255, 255, 255, 0.2);
          margin: 0;
          line-height: 1;
        }
        .message {
          margin-top: 20px;
          font-size: 1.3rem;
          color: #ccc;
        }
        .light {
          position: fixed;
          width: 300px;
          height: 300px;
          background: radial-gradient(circle,
            rgba(255,255,255,0.08) 0%,
            rgba(255,255,255,0.06) 20%,
            rgba(255,255,255,0.03) 40%,
            transparent 70%);
          border-radius: 50%;
          transform: translate(-50%, -50%);
          pointer-events: none;
          mix-blend-mode: screen;
        }
      .link_404{
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin: 24px 0 0;
          padding: 12px 28px;
          color: rgba(255, 255, 255, 0.92);
          font-weight: 600;
          text-decoration: none;
          border-radius: 14px;
          background:
            linear-gradient(155deg, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0.08)),
            linear-gradient(135deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.02));
          box-shadow:
            0 20px 40px rgba(0, 0, 0, 0.36),
            inset 0 1px 0 rgba(255, 255, 255, 0.5),
            inset 0 -12px 28px rgba(255, 255, 255, 0.07);
          backdrop-filter: blur(18px) saturate(185%);
          -webkit-backdrop-filter: blur(18px) saturate(185%);
          overflow: hidden;
          transition: transform 180ms ease, box-shadow 180ms ease, background 180ms ease;
        }
        .link_404::before {
          content: "";
          position: absolute;
          top: -55%;
          left: -25%;
          width: 80%;
          height: 240%;
          background: linear-gradient(120deg, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0));
          transform: rotate(10deg);
          opacity: 0.78;
          pointer-events: none;
          filter: blur(0.2px);
        }
        .link_404::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: 14px;
          background:
            radial-gradient(circle at 20% 15%, rgba(255, 255, 255, 0.32), transparent 48%),
            radial-gradient(circle at 75% 0%, rgba(255, 255, 255, 0.2), transparent 40%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0));
          opacity: 0.6;
          pointer-events: none;
        }
        .link_404:hover {
          transform: translateY(-1px);
          background:
            linear-gradient(155deg, rgba(255, 255, 255, 0.28), rgba(255, 255, 255, 0.1)),
            linear-gradient(135deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.03));
          box-shadow:
            0 24px 46px rgba(0, 0, 0, 0.4),
            inset 0 1px 0 rgba(255, 255, 255, 0.55),
            inset 0 -12px 30px rgba(255, 255, 255, 0.09);
        }
        .link_404:active {
          transform: translateY(0);
          box-shadow:
            0 16px 30px rgba(0, 0, 0, 0.34),
            inset 0 1px 0 rgba(255, 255, 255, 0.48),
            inset 0 -10px 26px rgba(255, 255, 255, 0.08);
        }
        .contant_box_404{ margin-top:-50px;}
        /* Responsive adjustments */
        @media (max-width: 768px) {
          .text-404 {
            font-size: 6rem;
          }
          .message {
            font-size: 1rem;
          }
          .light {
            width: 200px;
            height: 200px;
          }
        }

        @media (max-width: 480px) {
          .text-404 {
            font-size: 4.5rem;
          }
          .message {
            font-size: 0.9rem;
          }
          .light {
            width: 150px;
            height: 150px;
          }
        }
      `}</style>
      </div>
    </div>
  );
}
