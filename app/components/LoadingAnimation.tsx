"use client";



import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Line, Points, PointMaterial } from "@react-three/drei";
import type { Line2 } from "three-stdlib";
import * as THREE from "three";
import { useEffect, useMemo, useRef, useState } from "react";



/* ---------------- FRACTAL LIGHTNING ---------------- */



function generateBolt(
  start: THREE.Vector3,
  end: THREE.Vector3,
  depth = 4
): THREE.Vector3[] {
  if (depth === 0) return [start, end];



  const mid = start.clone().lerp(end, 0.5);
  mid.x += (Math.random() - 0.5) * depth * 0.6;
  mid.y += (Math.random() - 0.5) * depth * 0.6;



  return [
    ...generateBolt(start, mid, depth - 1),
    ...generateBolt(mid, end, depth - 1),
  ];
}



function LightningBolt({ color, side }: { color: string; side: number }) {
  const { viewport } = useThree();
  const ref = useRef<Line2>(null!);



  const points = useMemo(() => {
    const start = new THREE.Vector3(
      side * viewport.width * 0.9,
      (Math.random() - 0.5) * viewport.height * 0.4,
      0
    );
    const end = new THREE.Vector3(0, 0, 0);
    return generateBolt(start, end);
  }, []);



  const setLineOpacity = (line: Line2, opacity: number) => {
    const material = line.material;
    if (Array.isArray(material)) {
      material.forEach((mat) => {
        (mat as THREE.Material).transparent = true;
        (mat as THREE.Material).opacity = opacity;
      });
      return;
    }
    (material as THREE.Material).transparent = true;
    (material as THREE.Material).opacity = opacity;
  };

  useFrame(({ clock }) => {
    setLineOpacity(
      ref.current,
      0.6 + Math.sin(clock.elapsedTime * 40) * 0.3
    );
  });



  return (
    <Line
      ref={ref}
      points={points}
      color={color}
      lineWidth={2.8}
      transparent
      blending={THREE.AdditiveBlending}
    />
  );
}



/* ---------------- DIGITAL RAIN ---------------- */



function DigitalRain() {
  const count = 1200;



  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 60;
      arr[i * 3 + 1] = Math.random() * 40;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 20;
    }
    return arr;
  }, []);



  useFrame(() => {
    for (let i = 0; i < positions.length; i += 3) {
      positions[i + 1] -= 0.15;
      if (positions[i + 1] < -20) positions[i + 1] = 20;
    }
  });



  return (
    <Points positions={positions}>
      <PointMaterial
        color="#f97316"
        size={0.05}
        transparent
        opacity={0.5}
      />
    </Points>
  );
}



/* ---------------- CORE ---------------- */



function TerminalCore({ power }: { power: number }) {
  const ref = useRef<THREE.Mesh>(null!);



  useFrame(({ clock }) => {
    ref.current.rotation.x = clock.elapsedTime * 0.25;
    ref.current.rotation.y = clock.elapsedTime * 0.4;
    const pulse = 1 + power * 0.05;
    ref.current.scale.setScalar(pulse);
  });



  return (
    <>
      <mesh ref={ref}>
        <boxGeometry args={[4, 4, 4]} />
        <meshPhysicalMaterial
          transmission={1}
          thickness={1}
          roughness={0}
          metalness={0}
          opacity={0.15}
          transparent
          emissive="#f97316"
          emissiveIntensity={power * 1.2}
        />
      </mesh>



      <mesh>
        <boxGeometry args={[4.05, 4.05, 4.05]} />
        <meshBasicMaterial
          wireframe
          color="#f97316"
          transparent
          opacity={0.4}
        />
      </mesh>
    </>
  );
}



/* ---------------- MAIN ---------------- */



export default function ElectricalTerminalLoader({
  onComplete,
}: {
  onComplete?: () => void;
}) {
  const [progress, setProgress] = useState(0);
  const startTime = useRef<number | null>(null);
  const DURATION = 2000; // 3 seconds → always hits 100
  const completedRef = useRef(false);



  useEffect(() => {
    let raf: number;



    const animate = (time: number) => {
      if (!startTime.current) startTime.current = time;
      const elapsed = time - startTime.current;



      const t = Math.min(elapsed / DURATION, 1);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic



      setProgress(Math.floor(eased * 100));



      if (t < 1) raf = requestAnimationFrame(animate);
      else setProgress(100);
    };



    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (progress >= 100 && !completedRef.current) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [progress, onComplete]);



  return (
    <div className="fixed inset-0 bg-black overflow-hidden font-mono">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_40%,rgba(189,54,30,0.18),transparent_55%),radial-gradient(circle_at_70%_55%,rgba(41,167,137,0.18),transparent_55%)]" />



      {/* THREE */}
      <Canvas camera={{ position: [0, 0, 14], fov: 45 }}>
        <ambientLight intensity={0.3} />
        <pointLight position={[0, 0, 8]} intensity={2.5} />



        <LightningBolt color="#bd361eff" side={-1} />
        <LightningBolt color="#29a789ff" side={1} />
        <LightningBolt color="#bd361eff" side={-1.3} />
        <LightningBolt color="#38bdf8" side={1.3} />



        <TerminalCore power={progress / 100} />



        <DigitalRain />



        <gridHelper
          args={[100, 50, "rgba(41,167,137,0.16)", "rgba(20,98,79,0.12)"]}
          position={[0, -6, 0]}
          rotation={[Math.PI / 2.15, 0, 0]}
        />  
      </Canvas>



      {/* UI */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
        <h1 className="text-[9vw] font-black italic text-white drop-shadow-[0_0_60px_rgba(189,54,30,0.65)]">
          DEGEN <span className="stroke">TERMINAL</span>
        </h1>



        <div className="w-[60%] mt-12">
          <div className="h-4 bg-white/5 border border-white/10 relative overflow-hidden">
            <div
              className="absolute h-full bg-gradient-to-r from-[#14624F] via-[#29a789ff] to-[#bd361eff] shadow-[0_0_40px_rgba(189,54,30,0.7)]"
              style={{ width: `${progress}%` }}
            />
          </div>



          <div className="flex justify-between text-[10px] mt-3 tracking-[0.5em] text-[#14624F]">
            <span>SYSTEM BOOT</span>
            <span>{progress}%</span>
          </div>
        </div>
      </div>



      {/* CRT */}
      <div className="pointer-events-none absolute inset-0 z-50">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:100%_3px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle,transparent_35%,black_120%)]" />
      </div>



      <style jsx global>{`
        .stroke {
          -webkit-text-stroke: 2px white;
          color: transparent;
        }
      `}</style>
    </div>
  );
}
