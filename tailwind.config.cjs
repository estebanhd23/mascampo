/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#ecf7f0",
          100: "#d9efe0",
          200: "#b4dfc1",
          300: "#8fcfa2",
          400: "#6abf83",
          500: "#45af64",
          600: "#2f8f4f",
          700: "#21703f",
          800: "#195633",
          900: "#124127"   // verde oscuro corporativo
        }
      }
    },
  },
  plugins: [],
};
