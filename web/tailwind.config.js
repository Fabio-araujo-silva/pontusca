/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#060708', 900: '#0b0c0e', 850: '#101114', 800: '#15161a', 750: '#1a1b20', 700: '#212329', 600: '#2c2e36', 500: '#3a3d47' },
        mute: { DEFAULT: '#8e8e93', 2: '#636369' },
        live: { DEFAULT: '#ff3b30', soft: '#ff3b3022' },
        brand: { DEFAULT: '#d7ff3e', ink: '#0a0b00' },
        win: '#34c759',
        warn: '#ffcc00',
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Barlow Condensed"', '"Inter Variable"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 10px 30px -12px rgba(0,0,0,0.6)',
        glow: '0 0 0 1px rgba(255,255,255,0.06), 0 20px 50px -20px rgba(0,0,0,0.8)',
      },
      keyframes: {
        ping2: { '0%': { transform: 'scale(1)', opacity: '0.7' }, '80%,100%': { transform: 'scale(2.4)', opacity: '0' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        flash: { '0%': { opacity: '0' }, '15%': { opacity: '1' }, '100%': { opacity: '0' } },
      },
      animation: {
        ping2: 'ping2 1.6s cubic-bezier(0,0,0.2,1) infinite',
        shimmer: 'shimmer 1.6s linear infinite',
        flash: 'flash 1.4s ease-out',
      },
    },
  },
  plugins: [],
};
