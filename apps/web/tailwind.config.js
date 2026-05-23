/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#7C3AED',
          hover: '#6D28D9',
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
        },
        secondary: {
          DEFAULT: '#4C1D95',
          hover: '#3B0764',
          50: '#f5f3ff',
          100: '#ede9fe',
          700: '#4C1D95',
          800: '#3B0764',
        },
        accent: {
          DEFAULT: '#a855f7',
          hover: '#9333ea',
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
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-down': {
          from: { opacity: '0', transform: 'translateY(-8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.18s ease-out',
        'fade-in-up': 'fade-in-up 0.25s ease-out',
        'slide-down': 'slide-down 0.2s ease-out',
        'pulse-soft': 'pulse-soft 1.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
