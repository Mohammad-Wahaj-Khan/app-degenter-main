import React from "react";

interface NewTokenBadgeProps {
  title?: string;
  className?: string;
}

const NewTokenBadge: React.FC<NewTokenBadgeProps> = ({
  title = "Recently Launched", // token whose launched on last 5 days
  className,
}) => (
  <span
    className={`relative inline-flex h-4 w-2 items-center ${className ?? ""}`}
    title={title}
    aria-label={title}
  >
    <span className="absolute inline-flex h-2 w-2 rounded-full bg-[#FA4E30] opacity-75"></span>
    <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-[#FA4E30]"></span>
  </span>
);

export default NewTokenBadge;
