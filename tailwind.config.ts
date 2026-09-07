import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#1a2744",
          light: "#243256",
          hover: "#2d3f6e",
        },
        accent: {
          DEFAULT: "#2563eb",
          light: "#eff6ff",
        },
        brand: {
          orange: "#f97316",
          "orange-light": "#fff7ed",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Noto Sans Devanagari", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Noto Serif Devanagari", "Georgia", "serif"],
      },
      typography: {
        hindi: {
          css: {
            lineHeight: "1.85",
            fontSize: "1.0625rem",
            p: { marginBottom: "1.4em" },
            "h2,h3": { fontWeight: "600", letterSpacing: "-0.01em" },
          },
        },
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};

export default config;
