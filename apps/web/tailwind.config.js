/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1d4ed8',
          hover: '#1e40af',
          50: '#eff6ff',
          100: '#dbeafe',
          700: '#1d4ed8',
          800: '#1e40af',
        },
        accent: {
          DEFAULT: '#f59e0b',
          hover: '#d97706',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
      },
    },
  },
  plugins: [],
};
