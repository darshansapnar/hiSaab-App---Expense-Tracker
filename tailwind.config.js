/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: If your files are in the src directory, point tailwind to src.
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: "#0D0D0D",     // Deep black primary background
        surface: "#161616",        // Secondary dark container surface
        surfaceLight: "#222222",   // Lighter surface for highlights
        accentCyan: "#00F5D4",     // Electric cyan for primary buttons / actions
        accentPurple: "#7B2CBF",   // Premium purple / accent
        accentGreen: "#39FF14",    // Neon green for positive balances (receiving)
        accentPink: "#FF007F",     // Neon pink for owed balances (dues)
        accentGray: "#A3A3A3",     // Neutral muted text gray
      },
      fontFamily: {
        sans: ["System", "Inter"], // Fallback to System
      },
    },
  },
  plugins: [],
}
