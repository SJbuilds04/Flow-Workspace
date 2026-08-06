/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: '#0b0b0c',
          raised: '#101012',
          sunken: '#080809'
        },
        surface: {
          1: 'rgba(255,255,255,0.024)',
          2: 'rgba(255,255,255,0.044)',
          3: 'rgba(255,255,255,0.070)'
        },
        edge: {
          subtle: 'rgba(255,255,255,0.055)',
          DEFAULT: 'rgba(255,255,255,0.085)',
          strong: 'rgba(255,255,255,0.135)'
        },
        ink: {
          DEFAULT: '#f2f2f3',
          muted: '#a2a2a9',
          faint: '#6d6d76',
          ghost: '#4a4a52'
        },
        accent: {
          DEFAULT: '#8b7bff',
          soft: 'rgba(139,123,255,0.14)',
          ring: 'rgba(139,123,255,0.38)'
        },
        danger: {
          DEFAULT: '#ff6b6b',
          soft: 'rgba(255,107,107,0.12)'
        },
        success: {
          DEFAULT: '#3ecf8e',
          soft: 'rgba(62,207,142,0.12)'
        }
      },
      fontFamily: {
        sans: [
          '"Segoe UI Variable Text"',
          '"Segoe UI"',
          'Inter',
          'ui-sans-serif',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif'
        ],
        display: [
          '"Segoe UI Variable Display"',
          '"Segoe UI"',
          'Inter',
          'ui-sans-serif',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'sans-serif'
        ],
        mono: ['"Cascadia Code"', '"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace']
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.01em' }],
        xs: ['0.75rem', { lineHeight: '1.125rem', letterSpacing: '0.005em' }],
        sm: ['0.8125rem', { lineHeight: '1.25rem' }],
        base: ['0.9375rem', { lineHeight: '1.5rem' }],
        lg: ['1.0625rem', { lineHeight: '1.625rem' }],
        xl: ['1.25rem', { lineHeight: '1.75rem', letterSpacing: '-0.012em' }],
        '2xl': ['1.5rem', { lineHeight: '2rem', letterSpacing: '-0.018em' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem', letterSpacing: '-0.024em' }]
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem',
        '4xl': '2rem'
      },
      boxShadow: {
        glass: '0 1px 0 0 rgba(255,255,255,0.05) inset, 0 24px 60px -24px rgba(0,0,0,0.85)',
        pop: '0 18px 48px -12px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.06)',
        float: '0 8px 30px -8px rgba(0,0,0,0.6)',
        ring: '0 0 0 1px rgba(255,255,255,0.08)'
      },
      backdropBlur: {
        glass: '28px'
      },
      transitionTimingFunction: {
        flow: 'cubic-bezier(0.22, 1, 0.36, 1)',
        swift: 'cubic-bezier(0.4, 0, 0.2, 1)'
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' }
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' }
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(139,123,255,0.35)' },
          '70%': { boxShadow: '0 0 0 8px rgba(139,123,255,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(139,123,255,0)' }
        }
      },
      animation: {
        'fade-in': 'fade-in 200ms cubic-bezier(0.22, 1, 0.36, 1)',
        shimmer: 'shimmer 1.6s infinite',
        'pulse-ring': 'pulse-ring 2s cubic-bezier(0.22, 1, 0.36, 1) infinite'
      }
    }
  },
  plugins: []
}
