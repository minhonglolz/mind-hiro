/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './app/**/*.{ts,html}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Display"',
          '"SF Pro Text"',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
        mono: [
          '"SF Mono"',
          '"Fira Code"',
          '"Fira Mono"',
          '"Roboto Mono"',
          'monospace',
        ],
      },
      colors: {
        hiro: {
          50:  '#fff4ee',
          100: '#ffe3cf',
          200: '#ffc49a',
          300: '#ff9d5e',
          400: '#ff6e21',
          500: '#ed6424',
          600: '#d44e0f',
          700: '#b03a08',
          800: '#8f2f0b',
          900: '#74280d',
        },
      },
    },
  },
  plugins: [],
}
