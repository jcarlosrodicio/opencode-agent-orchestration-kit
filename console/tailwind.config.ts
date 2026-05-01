import type { Config } from 'tailwindcss'

export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        console: {
          root: '#05080f',
          shell: '#080d16',
          panel: '#0d1420',
          raised: '#111b2a',
          line: '#223047',
          strong: '#334966',
          text: '#e6edf6',
          muted: '#8b9bb0',
          dim: '#5e6d82',
          active: '#4da3ff',
          success: '#32d583',
          warning: '#f2b84b',
          danger: '#f97066',
          ahe: '#c084fc'
        }
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace']
      },
      boxShadow: {
        panel: '0 2px 8px rgba(0, 0, 0, 0.18)'
      }
    }
  },
  plugins: []
} satisfies Config
