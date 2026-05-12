"use client";

import { BarChart2, PanelRightOpen } from "lucide-react";

type PanelVariant = "detail" | "transactions" | "profile";

type ForensicsToolbarProps = {
  activePanel: PanelVariant | null;
  onToggle: (panel: PanelVariant) => void;
};

const ITEMS: Array<{
  key: PanelVariant;
  label: string;
  icon: typeof PanelRightOpen;
}> = [
  { key: "detail", label: "Address details", icon: PanelRightOpen },
  { key: "profile", label: "Profile stats", icon: BarChart2 },
];

export default function ForensicsToolbar({
  activePanel,
  onToggle,
}: ForensicsToolbarProps) {
  return (
    <div className="forensics-toolbar pointer-events-auto">
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = activePanel === item.key;
        return (
          <button
            key={item.key}
            type="button"
            className={`forensics-toolbar-btn ${isActive ? "active" : ""}`}
            aria-label={item.label}
            title={item.label}
            onClick={() => onToggle(item.key)}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
