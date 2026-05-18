/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#EA6C00',
          hover: '#c95d00',
          50: '#fff4e8',
          100: '#fde4c2',
          500: '#EA6C00',
          600: '#c95d00',
          700: '#a84e00',
        },
        secondary: {
          DEFAULT: '#1A3A5C',
          hover: '#142e4a',
          50: '#eef3f9',
          100: '#c9d9ec',
          700: '#1A3A5C',
          800: '#142e4a',
        },
        accent: {
          DEFAULT: '#F0A500',
          hover: '#d4920a',
        },
        success: {
          DEFAULT: '#16a34a',
          light: '#dcfce7',
        },
        warning: {
          DEFAULT: '#d97706',
          light: '#fef3c7',
        },
        error: {
          DEFAULT: '#dc2626',
          light: '#fee2e2',
        },
        surface: '#f7f9fc',
        border: '#dde3ec',
        muted: '#64748b',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
      },
    },
  },
  plugins: [],
};
