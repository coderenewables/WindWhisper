const forms = require("@tailwindcss/forms");

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f5f8fb",
          100: "#dde7f0",
          200: "#b8cddd",
          300: "#8aa7bd",
          400: "#5f7d98",
          500: "#45627c",
          600: "#344c63",
          700: "#26394a",
          800: "#18242f",
          900: "#0d141d",
        },
        ember: {
          300: "#ffb37a",
          400: "#ff9157",
          500: "#f06f32",
        },
        teal: {
          300: "#7de2d1",
          400: "#42b9aa",
          500: "#1f8f84",
        },
      },
      boxShadow: {
        panel: "0 24px 60px rgba(13, 20, 29, 0.18)",
      },
      fontFamily: {
        sans: ["Sora", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      backgroundImage: {
        mesh: "radial-gradient(circle at top left, rgba(240,111,50,0.18), transparent 30%), radial-gradient(circle at 80% 10%, rgba(31,143,132,0.18), transparent 26%), linear-gradient(135deg, rgba(255,255,255,0.98), rgba(235,242,247,0.92))",
      },
    },
  },
  plugins: [forms],
};