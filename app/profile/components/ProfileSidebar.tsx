"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import {
  FiHome,
  FiSettings,
  FiActivity,
  FiBell,
  FiMenu,
  FiX,
  FiHelpCircle,
  FiLock,
} from "react-icons/fi";

const navItems = [
  {
    label: "Overview",
    icon: <FiHome />,
    href: "/profile",
    badge: null,
  },
  {
    label: "Activity",
    icon: <FiActivity />,
    href: "/profile/activity",
    badge: null,
  },
  {
    label: "Notifications",
    icon: <FiBell />,
    href: "/profile/notifications",
    badge: "3",
  },
  {
    label: "Settings",
    icon: <FiSettings />,
    href: "/profile/settings",
    badge: null,
  },
];

const NavItem = ({
  item,
  isActive,
  onClick,
}: {
  item: (typeof navItems)[0];
  isActive: boolean;
  onClick?: () => void;
}) => {
  const isLocked = item.label !== "Overview";

  const content = (
    <motion.div
      whileHover={!isLocked ? { x: 4 } : {}}
      whileTap={!isLocked ? { scale: 0.98 } : {}}
      className={`group relative flex items-center justify-between p-3.5 rounded-xl transition-all duration-300 ${
        isActive
          ? "bg-emerald-500/[0.08] border border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.05)]"
          : "border border-transparent"
      } ${isLocked ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
    >
      {isActive && (
        <motion.div
          layoutId="activeGlow"
          className="absolute left-[-1px] top-1/4 bottom-1/4 w-[2px] bg-emerald-500 shadow-[0_0_10px_#10b981]"
        />
      )}

      <div className="flex items-center gap-3.5">
        <span
          className={`text-lg transition-colors duration-300 ${
            isActive
              ? "text-emerald-400"
              : "text-neutral-500 group-hover:text-neutral-300"
          }`}
        >
          {item.icon}
        </span>
        <span
          className={`text-sm font-bold tracking-tight transition-colors duration-300 ${
            isActive
              ? "text-white"
              : "text-neutral-400 group-hover:text-neutral-200"
          }`}
        >
          {item.label}
        </span>
      </div>

      {isLocked ? (
        <FiLock className="w-3 h-3 text-neutral-600" />
      ) : item.badge ? (
        <span className="flex items-center justify-center h-5 min-w-[20px] px-1.5 text-[10px] font-black rounded-md bg-emerald-500 text-black shadow-[0_0_10px_rgba(16,185,129,0.4)]">
          {item.badge}
        </span>
      ) : null}
    </motion.div>
  );

  return isLocked ? (
    <div className="relative">{content}</div>
  ) : (
    <Link href={item.href} className="block no-underline" onClick={onClick}>
      {content}
    </Link>
  );
};

export default function ProfileSidebar() {
  const pathname = usePathname();
  const [isMobile, setIsMobile] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // Set initial state based on viewport width
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      // Only auto-close when resizing to mobile
      if (mobile && isOpen) {
        setIsOpen(false);
      }
    };

    // Set initial state
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isOpen]);

  // Close sidebar when navigating on mobile
  useEffect(() => {
    if (isMobile) {
      setIsOpen(false);
    }
  }, [pathname, isMobile]);

  // Toggle sidebar
  const toggleSidebar = () => {
    setIsOpen(!isOpen);
  };

  // Mobile menu button
  const MobileMenuButton = () => (
    <button
      onClick={toggleSidebar}
      className="hidden left-4 top-4 z-50 rounded-lg bg-black/50 p-2.5 text-white backdrop-blur-md transition-all hover:bg-black/70 md:hidden"
      aria-label="Toggle menu"
    >
      {isOpen ? <FiX size={20} /> : <FiMenu size={20} />}
    </button>
  );

  // Always show the mobile menu button on mobile
  if (isMobile) {
    return (
      <>
        <MobileMenuButton />
        {/* Sidebar overlay and content when open */}
        <div
          className={`hidden inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300 md:hidden ${
            isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
          onClick={toggleSidebar}
        >
          <aside
            className={`h-full w-[280px] bg-[#0a0a0a] border-r border-white/10 transform transition-transform duration-300 ${
              isOpen ? "translate-x-0" : "-translate-x-full"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-8 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-full bg-emerald-500/5 blur-[40px] -translate-y-1/2" />
              <h2 className="relative text-2xl font-black tracking-tighter text-white">
                TERMINAL
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">
                  System Online
                </p>
              </div>
            </div>
            <nav className="flex-1 px-4 py-2 space-y-8 overflow-y-auto">
              <div>
                <h3 className="px-4 mb-4 text-[10px] font-black text-neutral-600 uppercase tracking-[0.3em]">
                  Navigation
                </h3>
                <div className="space-y-1.5">
                  {navItems.map((item) => (
                    <NavItem
                      key={item.href}
                      item={item}
                      isActive={pathname === item.href}
                      onClick={toggleSidebar}
                    />
                  ))}
                </div>
              </div>
            </nav>
          </aside>
        </div>
      </>
    );
  }

  // Desktop sidebar
  return (
    <aside className="sticky top-0 h-screen w-[280px] flex-col hidden md:flex">
      {/* Sidebar Header with Degenter Glow */}
      <div className="p-8 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-emerald-500/5 blur-[40px] -translate-y-1/2" />
        <h2 className="relative text-2xl font-black tracking-tighter text-white">
          TERMINAL
        </h2>
        <div className="flex items-center gap-2 mt-1">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">
            System Online
          </p>
        </div>
      </div>

      <nav className="flex-1 px-4 py-2 space-y-8 overflow-y-auto">
        <div>
          <h3 className="px-4 mb-4 text-[10px] font-black text-neutral-600 uppercase tracking-[0.3em]">
            Navigation
          </h3>
          <div className="space-y-1.5">
            {navItems.map((item) => (
              <NavItem
                key={item.href}
                item={item}
                isActive={pathname === item.href}
                onClick={() => isMobile && setIsOpen(false)}
              />
            ))}
          </div>
        </div>

        <div>
          <h3 className="px-4 mb-4 text-[10px] font-black text-neutral-600 uppercase tracking-[0.3em]">
            Utility
          </h3>
          <Link
            href="/help"
            className="group flex items-center gap-3.5 p-3.5 text-sm font-bold text-neutral-400 rounded-xl border border-transparent hover:border-white/5 hover:bg-white/[0.02] transition-all"
            onClick={() => isMobile && setIsOpen(false)}
          >
            <FiHelpCircle className="text-lg text-neutral-500 group-hover:text-emerald-400 transition-colors" />
            <span className="group-hover:text-white transition-colors">
              Support
            </span>
          </Link>
        </div>
      </nav>
    </aside>
  );
}
