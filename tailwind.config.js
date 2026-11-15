export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1f2d43',
        muted: '#8794a8',
        paper: '#ffffff',
        sky: {
          50: '#f5f8ff',
          100: '#edf4ff',
          200: '#deebff',
          500: '#5b93ed',
          600: '#3f80e8',
        },
      },
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        display: ['Manrope', 'sans-serif'],
      },
      boxShadow: {
        card: '0 10px 32px rgba(69, 103, 157, .07)',
        dock: '0 12px 44px rgba(37, 61, 101, .22)',
      },
    },
  },
  plugins: [],
}
