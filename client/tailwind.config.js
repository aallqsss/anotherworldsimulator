/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: { 900: '#0a0e1a', 800: '#111827' },
        gold: '#ffd700',
        crimson: '#e63946'
      },
      fontFamily: {
        pixel: ['"Press Start 2P"', 'monospace'],
        sans: ['system-ui', 'sans-serif']
      }
    },
  },
  plugins: [],
}
