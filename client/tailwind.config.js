/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },

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
        tenant: {
          50: "#eff6ff",
          100: "#dbeafe",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
        },
        admin: {
          50: "#faf5ff",
          100: "#f3e8ff",
          500: "#a855f7",
          600: "#9333ea",
          700: "#7e22ce",
        },
        state: {
          50: "#ecfdf5",
          100: "#d1fae5",
          500: "#10b981",
          600: "#059669",
          700: "#047857",
        },
      },

      /* PROFESSIONAL CARD SHADOWS */
      boxShadow: {
        card: "0 2px 8px rgba(0,0,0,0.06)",
        cardHover: "0 8px 24px rgba(0,0,0,0.10)",
        drawer: "0 20px 50px rgba(0,0,0,0.15)",
        elevated: "0 4px 16px rgba(0,0,0,0.08)",
        'elevated-lg': "0 12px 40px rgba(0,0,0,0.12)",
        inner: "inset 0 2px 4px rgba(0,0,0,0.04)",
      },

      /* BETTER BORDER RADIUS */
      borderRadius: {
        xl2: "1rem",
        xl3: "1.25rem",
        '2xl': "1rem",
        '3xl': "1.5rem",
      },

      /* REFINED ANIMATIONS */
      keyframes: {
        slideInRight: {
          "0%": { transform: "translateX(100%)", opacity: 0 },
          "100%": { transform: "translateX(0)", opacity: 1 },
        },
        slideInLeft: {
          "0%": { transform: "translateX(-20px)", opacity: 0 },
          "100%": { transform: "translateX(0)", opacity: 1 },
        },
        fadeIn: {
          "0%": { opacity: 0 },
          "100%": { opacity: 1 },
        },
        fadeInUp: {
          "0%": { opacity: 0, transform: "translateY(16px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
        fadeInDown: {
          "0%": { opacity: 0, transform: "translateY(-16px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
        scaleIn: {
          "0%": { opacity: 0, transform: "scale(0.95)" },
          "100%": { opacity: 1, transform: "scale(1)" },
        },
        slideUp: {
          "0%": { transform: "translateY(100%)", opacity: 0 },
          "100%": { transform: "translateY(0)", opacity: 1 },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
      },

      animation: {
        slideInRight: "slideInRight 0.3s ease-out",
        slideInLeft: "slideInLeft 0.3s ease-out",
        fadeIn: "fadeIn 0.3s ease-in-out",
        fadeInUp: "fadeInUp 0.5s ease-out",
        fadeInDown: "fadeInDown 0.3s ease-out",
        scaleIn: "scaleIn 0.3s ease-out",
        slideUp: "slideUp 0.4s ease-out",
        shimmer: "shimmer 1.5s linear infinite",
        float: "float 3s ease-in-out infinite",
      },

      /* CLEAN DASHBOARD BORDERS */
      borderColor: {
        soft: "#eef2f7",
      },

      transitionTimingFunction: {
        'out-cubic': 'cubic-bezier(0.33, 1, 0.68, 1)',
        'in-out-cubic': 'cubic-bezier(0.65, 0, 0.35, 1)',
      },
    },
  },
  plugins: [
    require("@tailwindcss/forms"),
  ],
};
