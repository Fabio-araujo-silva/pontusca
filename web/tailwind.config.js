/** @type {import('tailwindcss').Config} */

// Cores semânticas via variáveis CSS (definidas em src/index.css).
// "white" = cor do texto/tintas e "black" = cor do fundo: assim `text-white`,
// `bg-white/[0.06]` e o chip invertido `bg-white text-black` seguem o tema.
// Pra branco/preto literais (texto sobre cor de atlética, botão vermelho) use snow/coal.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        white: v('fg'),
        black: v('bg'),
        snow: '#ffffff',
        coal: '#0b0b0d',
        ink: { DEFAULT: v('ink'), 900: v('ink-900'), 850: v('ink-850'), 800: v('ink-800'), 750: v('ink-750'), 700: v('ink-700'), 600: v('ink-600'), 500: v('ink-500') },
        mute: { DEFAULT: v('mute'), 2: v('mute-2') },
        live: { DEFAULT: '#e0261d', soft: '#e0261d1f' },
        brand: { DEFAULT: v('brand'), ink: v('brand-ink') },
        win: '#15803d',
        // paleta pop do TUSCA 2026 (decorativa: etiquetas, destaques, ticker)
        pop: { orange: '#ff8a15', purple: '#8a0791', green: '#43e856', yellow: '#fff41f', magenta: '#ff27ff', blue: '#316cff' },
        warn: '#b45309',
      },
      fontFamily: {
        // a mesma família do site do TUSCA 2026
        sans: ['"Funnel Display Variable"', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        // condensada pesada (parente da Snug do TUSCA): títulos, placar, etiquetas
        display: ['"Big Shoulders Display Variable"', '"Arial Narrow"', 'sans-serif'],
        poster: ['"Big Shoulders Display Variable"', '"Arial Narrow"', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,16,20,0.04), 0 6px 20px -12px rgba(16,16,20,0.14)',
        glow: '0 24px 60px -20px rgba(16,16,20,0.35), 0 0 0 1px rgba(16,16,20,0.06)',
      },
      keyframes: {
        ping2: { '0%': { transform: 'scale(1)', opacity: '0.7' }, '80%,100%': { transform: 'scale(2.4)', opacity: '0' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        marquee: { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-50%)' } },
      },
      animation: {
        ping2: 'ping2 1.6s cubic-bezier(0,0,0.2,1) infinite',
        shimmer: 'shimmer 1.6s linear infinite',
        marquee: 'marquee 38s linear infinite',
      },
    },
  },
  plugins: [],
};
