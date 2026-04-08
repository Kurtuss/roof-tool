import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#f0f9ff",
          100: "#e0f2fe",
          200: "#bae6fd",
          300: "#7dd3fc",
          400: "#38bdf8",
          500: "#0ea5e9",
          600: "#0284c7",
          700: "#0369a1",
          800: "#075985",
          900: "#0c4a6e",
          950: "#082f49",
        },
        hex: {
          bg:     "#f0f7ff",
          card:   "rgba(255, 255, 255, 0.85)",
          glow:   "rgba(14, 165, 233, 0.15)",
          border: "rgba(14, 165, 233, 0.2)",
          dark:   "#0a1628",
          panel:  "#0d1f3c",
        },
      },
      backgroundImage: {
        "hex-pattern": `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='49' viewBox='0 0 28 49'%3E%3Cg fill-rule='evenodd'%3E%3Cg fill='%230ea5e9' fill-opacity='0.04'%3E%3Cpath d='M13.99 9.25l13 7.5v15l-13 7.5L1 31.75v-15l12.99-7.5zM3 17.9v12.7l10.99 6.34 11-6.35V17.9l-11-6.34L3 17.9zM0 15l12.98-7.5V0h-2v6.35L0 12.69v2.3zm0 18.5L12.98 41v8h-2v-6.85L0 35.81v-2.3zM15 0v7.5L27.99 15H28v-2.31h-.01L17 6.35V0h-2zm0 49v-8l12.99-7.5H28v2.31h-.01L17 42.15V49h-2z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      },
      boxShadow: {
        "hex-glow": "0 0 30px rgba(14, 165, 233, 0.1), 0 0 60px rgba(14, 165, 233, 0.05)",
        "hex-card": "0 4px 24px rgba(14, 165, 233, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04)",
        "hex-hover": "0 8px 32px rgba(14, 165, 233, 0.15), 0 2px 8px rgba(0, 0, 0, 0.06)",
      },
      animation: {
        "pulse-slow": "pulse 3s ease-in-out infinite",
        "hex-spin": "hex-spin 20s linear infinite",
      },
      keyframes: {
        "hex-spin": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
