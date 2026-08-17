import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Surfaces: a cold, low-light control room. Four steps, no gradients.
        base: "#0A0C0F",
        panel: "#12151A",
        raised: "#181C22",
        line: "#232830",
        edge: "#2E353F",
        // Text
        ink: "#ECEFF3",
        muted: "#8A94A3",
        dim: "#5C6672",
        // State
        signal: "#FFB020", // clock running / on the clock
        confirm: "#35C17E", // pick saved
        alert: "#E5484D", // undo, errors, offline
        // Positions — desaturated so six of them can sit on one board
        qb: "#A78BFA",
        rb: "#3FB98A",
        wr: "#56A8F5",
        te: "#E8973F",
        k: "#94A3B8",
        dst: "#B5729B",
      },
      fontFamily: {
        // Condensed broadcast numerals for the scoreboard
        display: ['"Barlow Condensed"', "Impact", "sans-serif"],
        // Sturdy grotesque for names and UI
        sans: ["Archivo", "system-ui", "sans-serif"],
        // Tabular figures for pick numbers, ADP, bye weeks
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      fontSize: {
        eyebrow: ["0.6875rem", { lineHeight: "1", letterSpacing: "0.18em" }],
      },
      borderRadius: { none: "0", sm: "2px", DEFAULT: "3px", md: "4px", lg: "6px" },
    },
  },
  plugins: [],
};

export default config;
