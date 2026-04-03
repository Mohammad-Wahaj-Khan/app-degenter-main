// app/components/PriceDisplay.tsx
import React, { useEffect, useState } from "react";

interface PriceDisplayProps {
  isSingleHop: boolean;
  activePay: {
    symbol: string;
    decimals: number;
    type: string;
    denom?: string;
    contract?: string;
  };
  activeReceive: {
    symbol: string;
    decimals: number;
    type: string;
    denom?: string;
    contract?: string;
  };
  routePairs: Array<{ pairContract: string }>;
  qClientRef: React.MutableRefObject<any>;
  recvPriceUsd?: number;
}

const PriceDisplay: React.FC<PriceDisplayProps> = ({
  isSingleHop,
  activePay,
  activeReceive,
  routePairs,
  qClientRef,
  recvPriceUsd,
}) => {
  const [rate, setRate] = useState<number>(0);

  // Helper functions
  const formatNumber = (num: number) => {
    const n = Number(num);
    if (!Number.isFinite(n) || n === 0) return "0.000000";

    // For very small numbers, use exponential notation
    if (Math.abs(n) < 0.000001) {
      return n.toExponential(4);
    }

    // For numbers smaller than 1, show up to 8 decimal places
    if (Math.abs(n) < 1) {
      return n.toFixed(8).replace(/\.?0+$/, "");
    }

    // For larger numbers, show up to 6 decimal places
    return n.toFixed(6).replace(/\.?0+$/, "");
  };

  const pow10 = (d: number) => Math.pow(10, d);

  useEffect(() => {
    const calculateRate = async () => {
      if (!isSingleHop || !qClientRef.current || routePairs.length === 0) {
        setRate(0);
        return;
      }

      try {
        // Use 1 unit of the paying token to calculate rate
        const baseAmount = 1;
        const amountInMicro =
          activePay.decimals === 0 ? "1" : pow10(activePay.decimals).toString();

        const pair = routePairs[0];
        const offer_asset =
          activePay.type === "native"
            ? {
                amount: amountInMicro,
                info: { native_token: { denom: activePay.denom } },
              }
            : {
                amount: amountInMicro,
                info: { token: { contract_addr: activePay.contract } },
              };

        const sim: any = await qClientRef.current.queryContractSmart(
          pair.pairContract,
          { simulation: { offer_asset } }
        );

        const returnMicro = Number(sim?.return_amount || "0");
        const out =
          activeReceive.decimals === 0
            ? returnMicro
            : returnMicro / pow10(activeReceive.decimals);

        setRate(out);

        console.log({
          fromSymbol: activePay.symbol,
          toSymbol: activeReceive.symbol,
          baseAmount,
          outputAmount: out,
          rate: out,
          formatted: formatNumber(out),
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error("Price calculation error:", error);
        setRate(0);
      }
    };

    const debounceTimer = setTimeout(calculateRate, 250);
    return () => clearTimeout(debounceTimer);
  }, [isSingleHop, activePay, activeReceive, routePairs, qClientRef]);

  if (!isSingleHop || rate === 0) {
    return null;
  }

  return (
    <div className="text-[11px] text-neutral-400 mt-1 space-y-0.5">
      <div>
        1 {activePay.symbol} = {formatNumber(rate)} {activeReceive.symbol}
        {recvPriceUsd !== undefined && ` ($${formatNumber(recvPriceUsd)})`}
      </div>
    </div>
  );
};

export default PriceDisplay;
