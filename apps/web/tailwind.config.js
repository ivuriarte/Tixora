/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // The legacy UI uses Tailwind's gray utilities extensively. Mapping the
        // scale to Axon's purple-neutral system keeps every existing workflow
        // on the ratified palette while screens migrate to semantic tokens.
        gray: {
          50: '#faf8ff',
          100: '#f5f0ff',
          200: '#e4dcf4',
          300: '#d3c8e8',
          400: '#8d82a8',
          500: '#756a92',
          600: '#6b5b8a',
          700: '#4f416c',
          800: '#2f1d49',
          900: '#1a0533',
          950: '#10011f',
        },
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
        surface: '#f5f0ff',
        border: '#e4dcf4',
        muted: '#756a92',
        ink: '#1a0533',
        'body-purple': '#6b5b8a',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
      },
      borderRadius: {
        xl: '0.5rem',
        '2xl': '0.5rem',
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
        'popup-enter': {
          from: { opacity: '0', transform: 'scale(0.88) translateY(16px)' },
          to:   { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'drain': {
          from: { width: '100%' },
          to:   { width: '0%' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.18s ease-out',
        'fade-in-up': 'fade-in-up 0.25s ease-out',
        'slide-down': 'slide-down 0.2s ease-out',
        'pulse-soft': 'pulse-soft 1.5s ease-in-out infinite',
        'popup-enter': 'popup-enter 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
  plugins: [],
};
