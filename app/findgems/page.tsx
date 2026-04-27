import type { Metadata } from "next";
import React from 'react';
import { 
  Search, 
  Wallet, 
  Globe, 
  Zap, 
  TrendingUp, 
  Flame, 
  BarChart3, 
  ChevronDown,
  Star,
  ExternalLink
} from 'lucide-react';
import Navbar from '../components/navbar';
import TopMarketToken from '../components/TopMarketToken';
import FeatureLaunchGate from '../components/feature-launch-gate';
import InsightsContent from '../insights/components/InsightsContent';
import FindGemsMain from './components/findgems';

export const metadata: Metadata = {
  title: "Find Gems | Degenter.io",
};

const Dashboard = () => {

  return (
    <FeatureLaunchGate feature="findgems">
      <main className="flex min-h-screen flex-col bg-black relative overflow-hidden">
        <div
          className="absolute inset-0 z-1 h-60"
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
            filter: "saturate(120%) contrast(110%) brightness(0.9)",
          }}
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                "linear-gradient(to bottom, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.65) 70%, rgba(0,0,0,0.9) 100%), radial-gradient(120% 120% at 50% 0%, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.45) 70%, rgba(0,0,0,0.75) 100%)",
              mixBlendMode: "multiply",
            }}
          />
          <div
            className="absolute inset-0 opacity-40 mix-blend-overlay pointer-events-none"
            style={{
              backgroundImage: `url("data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgdmlld0JveD0iMCAwIDEyOCAxMjgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGZpbHRlciBpZD0ibm9pc2UiIHg9IjAlIiB5PSIwJSIgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSI+PGZlVHVyYnVsZW5jZSB0eXBlPSJmcmFjdGFsTm9pc2UiIGJhc2VGcmVxdWVuY3k9IjAuOTgiIG51bU9jdGF2ZXM9IjUiIHN0aXRjaFRpbGVzPSJzdGl0Y2giLz48L2ZpbHRlcj48cmVjdCB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgZmlsdGVyPSJ1cmwoI25vaXNlKSIvPjwvc3ZnPg==")`,
              backgroundRepeat: "repeat",
              backgroundSize: "96px 96px",
              filter: "contrast(120%)",
            }}
          />
          <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-b from-transparent to-black"></div>
        </div>
        <div className="animate-header relative z-20">
          <Navbar />
          <TopMarketToken />
        </div>

        <FindGemsMain />
      </main>
    </FeatureLaunchGate>
  );
};

export default Dashboard;
