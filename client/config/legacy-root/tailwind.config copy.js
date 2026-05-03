/** @type {import('tailwindcss').Config} */

module.exports = {

  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./client/src/**/*.{js,jsx,ts,tsx}",
  ],

  theme: {

    extend: {

      /* PRIMARY BRAND COLOR */

      colors: {
        primary: {
          50: "#f0f9ff",
          100: "#e0f2fe",
          200: "#bae6fd",
          300: "#7dd3fc",
          400: "#38bdf8",
          500: "#0ea5e9",
          600: "#0284c7",
          700: "#0369a1",
          800: "#075985",
          900: "#0c4a6e",
        },
      },

      /* PROFESSIONAL CARD SHADOWS */

      boxShadow: {
        card: "0 2px 8px rgba(0,0,0,0.06)",
        cardHover: "0 6px 18px rgba(0,0,0,0.08)",
        drawer: "0 20px 50px rgba(0,0,0,0.15)",
      },

      /* BETTER BORDER RADIUS */

      borderRadius: {
        xl2: "1rem",
        xl3: "1.25rem",
      },

      /* ADMIN DASHBOARD ANIMATIONS */

      keyframes: {
        slideInRight: {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" },
        },
        fadeIn: {
          "0%": { opacity: 0 },
          "100%": { opacity: 1 },
        },
      },

      animation: {
        slideInRight: "slideInRight 0.25s ease-out",
        fadeIn: "fadeIn 0.2s ease-in",
      },

      /* CLEAN DASHBOARD BORDERS */

      borderColor: {
        soft: "#eef2f7",
      },

    },

  },

  plugins: [
    require("@tailwindcss/forms"),
  ],

};
