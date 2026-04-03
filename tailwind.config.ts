import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "!./app/**/node_modules/**/*",
  ],
  theme: {
    extend: {
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        "degen-gradient":
          "linear-gradient(to right, #10b981, #06d6a0, #f59e0b, #f97316, #ef4444, #8b5cf6, #7c3aed)",
      },
      colors: {
        degen: {
          teal: "#10b981",
          emerald: "#06d6a0",
          amber: "#f59e0b",
          orange: "#f97316",
          red: "#ef4444",
          purple: "#8b5cf6",
          violet: "#7c3aed",
        },
      },
    },
  },
  plugins: [],
};
export default config;
