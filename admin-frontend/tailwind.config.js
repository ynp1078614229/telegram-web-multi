/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#3b82f6',
        dark: {
          50: '#1e293b',
          100: '#334155',
          200: '#64748b',
          300: '#94a3b8',
          400: '#94a3b8',
          500: '#64748b',
          600: '#e2e8f0',
          700: '#f1f5f9',
          800: '#f8fafc',
          900: '#ffffff',
          950: '#ffffff',
        }
      }
    },
  },
  plugins: [],
}
