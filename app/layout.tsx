import type { Metadata } from "next";
import localFont from "next/font/local";
// @ts-ignore: Ignore missing type declarations for side-effect CSS import
import "./globals.css";
// @ts-ignore: Ignore missing type declarations for side-effect CSS import
import "reactflow/dist/style.css";

// import { WalletProvider } from "./providers/walletconnect-provider";
import CosmosProvider from "./providers/cosmos-provider";
import Providers from "./providers/cosmos-provider";
import SiteMotion from "./components/SiteMotion";
import LoadingWrapper from "./LoadingWrapper";
import ImageFallbackHandler from "./components/ImageFallbackHandler";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const kanit = localFont({
  src: [
    {
      path: "../font/Kanit-Thin.ttf",
      weight: "100",
      style: "normal",
    },
    {
      path: "../font/Kanit-ThinItalic.ttf",
      weight: "100",
      style: "italic",
    },
    {
      path: "../font/Kanit-ExtraLight.ttf",
      weight: "200",
      style: "normal",
    },
    {
      path: "../font/Kanit-ExtraLightItalic.ttf",
      weight: "200",
      style: "italic",
    },
    {
      path: "../font/Kanit-Light.ttf",
      weight: "300",
      style: "normal",
    },
    {
      path: "../font/Kanit-LightItalic.ttf",
      weight: "300",
      style: "italic",
    },
    {
      path: "../font/Kanit-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../font/Kanit-Italic.ttf",
      weight: "400",
      style: "italic",
    },
    {
      path: "../font/Kanit-Medium.ttf",
      weight: "500",
      style: "normal",
    },
    {
      path: "../font/Kanit-MediumItalic.ttf",
      weight: "500",
      style: "italic",
    },
    {
      path: "../font/Kanit-SemiBold.ttf",
      weight: "600",
      style: "normal",
    },
    {
      path: "../font/Kanit-SemiBoldItalic.ttf",
      weight: "600",
      style: "italic",
    },
    {
      path: "../font/Kanit-Bold.ttf",
      weight: "700",
      style: "normal",
    },
    {
      path: "../font/Kanit-BoldItalic.ttf",
      weight: "700",
      style: "italic",
    },
    {
      path: "../font/Kanit-ExtraBold.ttf",
      weight: "800",
      style: "normal",
    },
    {
      path: "../font/Kanit-ExtraBoldItalic.ttf",
      weight: "800",
      style: "italic",
    },
    {
      path: "../font/Kanit-Black.ttf",
      weight: "900",
      style: "normal",
    },
    {
      path: "../font/Kanit-BlackItalic.ttf",
      weight: "900",
      style: "italic",
    },
  ],
  variable: "--font-kanit",
});

export const metadata: Metadata = {
  title: "Degenter.io | Decentralized Intelligence for the Degens",
  description: "Degenter.io brings you on-chain alpha, memecoin analytics, and community-driven insights — powered by real-time blockchain intelligence.",
  icons: {
    icon: "/degen.svg", // or "/path/to/custom-icon.png"
  },
   keywords: [
    "Degenter",
    "DeFi",
    "Memecoins",
    "Crypto Analytics",
    "On-Chain Data",
    "Trading Tools",
    "Blockchain Insights",
    "Web3 Intelligence",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={cn("dark", "font-sans", geist.variable)}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body 
        className={`${kanit.className} bg-black antialiased`} 
        suppressHydrationWarning
      >
        <ImageFallbackHandler />
        <Providers>
          {/* LoadingWrapper now wraps the entire app. 
              It will display the "DT" Pulse animation for 10 seconds 
              before performing a cinematic blur-reveal of the children.
          */}
           {/* <LoadingWrapper> */}
            {children}
           {/* </LoadingWrapper> */}
        </Providers>
      </body>
    </html>
  );
}