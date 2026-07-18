/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: If your files are in the src directory, point tailwind to src.
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: "#0B1220",     // Premium deep dark blue/navy
        surface: "#151E2E",        // Secondary container surface
        surfaceLight: "#202D42",   // Lighter surface for highlights/tabs
        accentCyan: "#14E5D4",     // Electric cyan
        accentPurple: "#7B2CBF",   // Premium purple
        accentGreen: "#22C55E",    // Emerald green
        accentPink: "#EF4444",     // Rose red
        accentGray: "#94A3B8",     // Neutral text slate gray
      },
      fontFamily: {
        sans: ["System", "Inter"], // Fallback to System
      },
    },
  },
  plugins: [],
}
