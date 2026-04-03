"use client";

import { useSearchParams } from "next/navigation";
import HoldersBubble from "@/components/HoldersBubble";

const MapsPage = () => {
  const searchParams = useSearchParams();
  const tokenId = searchParams.get("tokenId") ?? "stzig";

  return (
    <div className="min-h-screen bg-[#020410] py-8">
      <HoldersBubble tokenId={tokenId} />
    </div>
  );
};

export default MapsPage;
