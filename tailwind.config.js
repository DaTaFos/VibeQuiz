/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50:  '#f0f4ff',
          100: '#dce8ff',
          200: '#b8d0ff',
          300: '#85afff',
          400: '#5080ff',
          500: '#2952f5',
          600: '#1a3de8',
          700: '#152fca',
          800: '#1628a4',
          900: '#172682',
        },
        accent: {
          yellow: '#fbbf24',
          green:  '#22c55e',
          red:    '#ef4444',
          purple: '#a855f7',
        },
      },
      animation: {
        'fade-in':    'fadeIn 0.3s ease-out',
        'slide-up':   'slideUp 0.4s ease-out',
        'bounce-in':  'bounceIn 0.5s cubic-bezier(0.68,-0.55,0.265,1.55)',
        'pulse-glow': 'pulseGlow 2s infinite',
        'countdown':  'countdown linear forwards',
      },
      keyframes: {
        fadeIn:    { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp:   { from: { opacity: '0', transform: 'translateY(20px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        bounceIn:  { from: { opacity: '0', transform: 'scale(0.8)' }, to:   { opacity: '1', transform: 'scale(1)' } },
        pulseGlow: { '0%,100%': { boxShadow: '0 0 5px rgba(41,82,245,0.4)' }, '50%': { boxShadow: '0 0 20px rgba(41,82,245,0.8)' } },
        countdown: { from: { width: '100%' }, to: { width: '0%' } },
      },
    },
  },
  plugins: [],
}
