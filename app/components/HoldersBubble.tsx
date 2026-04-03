 "use client";

 import React from "react";

 const HoldersBubble: React.FC<{ tokenId?: string }> = ({ tokenId }) => (
   <section className="rounded-xl border border-white/10 bg-gradient-to-br from-black/60 to-[#050505] p-4 text-sm text-white">
     <h2 className="text-lg font-semibold mb-2">Holders Bubble</h2>
     <p className="text-xs text-zinc-400">
       Token: {tokenId ?? "N/A"}
     </p>
     <p className="mt-2 text-zinc-300">
       Bubble visualization has been temporarily disabled. Check the latest holder analytics once it reopens.
     </p>
   </section>
 );

 export default HoldersBubble;
