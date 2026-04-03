import PortfolioHistory from "./PortfolioHistory";
import CurrentHolding from "./CurrentHolding";

type WalletAnalyzerPortfolioProps = {
  addressOverride?: string;
};

export default function Merge({ addressOverride }: WalletAnalyzerPortfolioProps) {
  return (
    <div className="flex flex-col items-center w-full gap-8">
      <PortfolioHistory addressOverride={addressOverride} />
      <CurrentHolding addressOverride={addressOverride} />
    </div>
  );
}
