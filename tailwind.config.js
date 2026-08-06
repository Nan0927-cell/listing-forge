/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0F0F0F",
          900: "#0F0F0F",
          800: "#1A1A1A",
          700: "#262626",
          600: "#3A3A3A",
          500: "#525252",
          400: "#737373",
          300: "#A3A3A3",
          200: "#D4D4D4",
          100: "#E5E5E5",
        },
        flame: {
          DEFAULT: "#FF6B35",
          600: "#E55A2B",
          700: "#C44A20",
        },
        bone: {
          DEFAULT: "#F5F2EB",
          50: "#FAF8F2",
          100: "#F5F2EB",
          200: "#EAE5D7",
        },
        steel: {
          DEFAULT: "#2D5F8A",
          600: "#244E72",
          700: "#1C3E5B",
        },
        rust: {
          DEFAULT: "#8B3A1F",
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        sans: ['"Noto Sans SC"', "system-ui", "sans-serif"],
      },
      letterSpacing: {
        tightest: "-0.04em",
        industrial: "0.08em",
      },
      boxShadow: {
        industrial: "6px 6px 0 0 rgba(15,15,15,1)",
        "industrial-sm": "3px 3px 0 0 rgba(15,15,15,1)",
        "inner-line": "inset 0 0 0 1px rgba(15,15,15,1)",
      },
      backgroundImage: {
        "grid-pattern":
          "linear-gradient(to right, rgba(15,15,15,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,15,15,0.04) 1px, transparent 1px)",
        "noise":
          "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E\")",
      },
      animation: {
        "slide-in": "slideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "fade-up": "fadeUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "scan": "scan 1.6s ease-in-out infinite",
      },
      keyframes: {
        slideIn: {
          "0%": { transform: "translateX(-12px)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        fadeUp: {
          "0%": { transform: "translateY(12px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        scan: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(8px)" },
        },
      },
    },
  },
  plugins: [],
};
