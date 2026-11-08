import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        alpine: {
          snow: "#F6F8F7",
          surface: "#FFFFFF",
          ink: "#0B1714",
          slate: "#4A5D58",
          muted: "#526660",
          border: "#E2E8E6",
          emerald: "#059669",
          emeraldDark: "#047857",
          emeraldSoft: "#ECFDF5",
          emeraldBorder: "#A7F3D0",
          amber: "#D97706",
          amberDark: "#B45309",
          amberSoft: "#FFFBEB",
          amberBorder: "#FDE68A",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-jakarta)",
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Display",
          "SF Pro Text",
          "sans-serif",
        ],
        display: [
          "var(--font-jakarta)",
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Display",
          "SF Pro Text",
          "sans-serif",
        ],
        mono: [
          "var(--font-jakarta)",
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Display",
          "SF Pro Text",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
