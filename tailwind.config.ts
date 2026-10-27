import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        sidebar: { DEFAULT: '#1e293b', hover: '#334155', active: '#3b82f6', text: '#f8fafc' },
        brand: {
          50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd',
          400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8',
          800: '#1e40af', 900: '#1e3a8a',
        },
        ink: { DEFAULT: '#1e293b', muted: '#64748b', soft: '#475569' },
        line: '#e2e8f0',
        surface: { DEFAULT: '#ffffff', muted: '#f8fafc', canvas: '#f5f5f5' },
      },
      fontFamily: { sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'] },
      keyframes: {
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'scale-in': { '0%': { opacity: '0', transform: 'scale(.95)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        'slide-in-right': { '0%': { opacity: '0', transform: 'translateX(100%)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        'slide-down': { '0%': { opacity: '0', transform: 'translateY(-6px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
      },
      animation: {
        'fade-up': 'fade-up 300ms ease-out both',
        'scale-in': 'scale-in 200ms ease-out both',
        'slide-in-right': 'slide-in-right 300ms ease-out both',
        'slide-down': 'slide-down 200ms ease-out both',
      },
    },
  },
  plugins: [],
};

export default config;
