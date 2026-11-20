/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Sora', 'Inter', 'system-ui', 'sans-serif']
      },
      colors: {
        obsidian: '#080a10',
        sapphire: '#3b82f6'
      },
      animation: {
        'mesh-drift': 'meshDrift 18s ease-in-out infinite alternate',
        'pulse-glow': 'pulseGlow 2.4s ease-in-out infinite',
        'float-slow': 'floatSlow 7s ease-in-out infinite'
      },
      keyframes: {
        meshDrift: {
          '0%': { transform: 'translate(0,0) scale(1)' },
          '50%': { transform: 'translate(4%, -3%) scale(1.08)' },
          '100%': { transform: 'translate(-3%, 4%) scale(1.05)' }
        },
        pulseGlow: {
          '0%,100%': { boxShadow: '0 0 0 0 rgba(59,130,246,0.45)' },
          '50%': { boxShadow: '0 0 0 10px rgba(59,130,246,0)' }
        },
        floatSlow: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' }
        }
      }
    }
  },
  plugins: []
};
