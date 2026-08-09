/** @type {import("tailwindcss").Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#2AABEE',
        'primary-dark': '#229ED9',
        'tg-bg': '#f4f4f5',
        'tg-sidebar': '#ffffff',
        'tg-chat-bg': '#e8dfd5',
        'tg-bubble-out': '#effdde',
        'tg-bubble-in': '#ffffff',
      },
    },
  },
  plugins: [],
}
