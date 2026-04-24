"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import HoldersBubble from "@/components/HoldersBubble";
import { applyPageMetadata } from "@/lib/page-metadata";

const MapsPage = () => {
  const searchParams = useSearchParams();
  const tokenId = searchParams.get("tokenId") ?? "stzig";

  useEffect(() => {
    applyPageMetadata({
      pageName: "Maps",
      description: "Maps | Degenter.io",
    });
  }, []);

  return (
    <div className="min-h-screen bg-[#020410] py-8">
      <HoldersBubble tokenId={tokenId} />
    </div>
  );
};

export default MapsPage;
