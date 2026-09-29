// AUTO-GENERADO a partir de assets-src/figma/design-tokens.json
// Regenerar: .venv/Scripts/python.exe scripts/build_design_tokens.py
// Trecho equivalente a `theme.extend` de frontend/tailwind.config.js.
// Uso: cole dentro de `theme: { extend: { ... } }` do tailwind.config.ts.
import type { Config } from 'tailwindcss';

type ThemeExtend = NonNullable<Config['theme']>['extend'];

export const themeExtend: ThemeExtend = {
  colors: {
    // superfícies / texto (bridge em tokens.css)
    background: 'hsl(var(--background))',
    foreground: 'hsl(var(--foreground))',
    card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--foreground))' },
    popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--foreground))' },
    muted: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--muted-foreground))' },
    border: 'hsl(var(--border))',
    input: 'hsl(var(--border-interactive))',
    ring: 'hsl(var(--ring))',
    link: { DEFAULT: 'hsl(var(--link))', hover: 'hsl(var(--link-hover))' },

    // marca / acento
    primary: {
      DEFAULT: 'hsl(var(--primary))',
      foreground: 'hsl(var(--primary-foreground))',
      hover: 'hsl(var(--primary-hover))',
      text: 'hsl(var(--primary-text))',
      subtle: '#3B82F61A',
      glow: '#3B82F64D',
    },
    accent: {
      DEFAULT: 'hsl(var(--accent))',
      foreground: 'hsl(var(--accent-foreground))',
      hover: 'hsl(var(--accent-hover))',
      subtle: '#22D3EE1A',
      glow: '#22D3EE4D',
    },
    secondary: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--foreground))', hover: 'hsl(var(--secondary-hover))' },

    // status
    success: { DEFAULT: 'hsl(var(--success))', foreground: 'hsl(var(--success-foreground))', hover: 'hsl(var(--success-hover))' },
    warning: { DEFAULT: 'hsl(var(--warning))', foreground: 'hsl(var(--warning-foreground))', hover: 'hsl(var(--warning-hover))' },
    destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))', hover: 'hsl(var(--destructive-hover))' },

    // severidade (laboratório)
    critical: { DEFAULT: 'hsl(var(--critical))', text: 'hsl(var(--critical-text))', subtle: '#EF44441A' },
    high: { DEFAULT: 'hsl(var(--high))', text: 'hsl(var(--high-text))', subtle: '#F973161A' },
    medium: { DEFAULT: 'hsl(var(--medium))', text: 'hsl(var(--medium-text))', subtle: '#EAB3081A' },
    low: { DEFAULT: 'hsl(var(--low))', text: 'hsl(var(--low-text))', subtle: '#3B82F61A' },
  },

  fontFamily: {
    sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
    mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
    display: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
  },

  fontSize: {
    'display-xl': ['clamp(3.5rem, 8vw, 6rem)', { lineHeight: '1.1', letterSpacing: '-0.03em' }],
    'display-lg': ['clamp(2.75rem, 6vw, 4.5rem)', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
    'display-md': ['clamp(2rem, 4vw, 3rem)', { lineHeight: '1.25', letterSpacing: '-0.02em' }],
    'display-sm': ['clamp(1.5rem, 3vw, 2.25rem)', { lineHeight: '1.25', letterSpacing: '-0.02em' }],
    'heading-xl': ['1.75rem', { lineHeight: '1.25', letterSpacing: '-0.02em' }],
    'heading-lg': ['1.5rem', { lineHeight: '1.25', letterSpacing: '-0.02em' }],
    'heading-md': ['1.25rem', { lineHeight: '1.25', letterSpacing: '0' }],
    'heading-sm': ['1.125rem', { lineHeight: '1.25', letterSpacing: '0' }],
    'body-lg': ['1.125rem', { lineHeight: '1.6', letterSpacing: '0' }],
    'body': ['1rem', { lineHeight: '1.6', letterSpacing: '0' }],
    'body-sm': ['0.875rem', { lineHeight: '1.6', letterSpacing: '0' }],
    'caption': ['0.75rem', { lineHeight: '1.6', letterSpacing: '0' }],
    'overline': ['0.6875rem', { lineHeight: '1.25', letterSpacing: '0.08em' }],
  },

  borderRadius: {
    'none': '0',
    'sm': '4px',
    'md': '8px',
    'lg': '12px',
    'xl': '16px',
    '2xl': '24px',
    'full': '9999px',
  },

  screens: {
    xs: '360px',   // 360
    sm: '640px',
    md: '768px',   // 768
    lg: '1024px',  // 1024
    xl: '1280px',
    wide: '1440px',   // 1440
    '2xl': '1536px',
  },

  spacing: {
    '18': '4.5rem',
    '22': '5.5rem',
    '30': '7.5rem',
  },

  transitionDuration: {
    'instant': '0ms',
    'micro': '150ms',
    'fast': '200ms',
    'normal': '300ms',
    'slow': '400ms',
    'deliberate': '500ms',
    'entrance': '600ms',
    'hero': '700ms',
  },

  transitionTimingFunction: {
    'standard': 'cubic-bezier(0.4, 0, 0.2, 1)',
    'out': 'cubic-bezier(0, 0, 0.2, 1)',
    'in': 'cubic-bezier(0.4, 0, 1, 1)',
    'expo-out': 'cubic-bezier(0.19, 1, 0.22, 1)',
    'spring': 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
  },

  boxShadow: {
    'none': 'none',
    'sm': '0 1px 2px 0 rgb(3 7 18 / 0.5)',
    'md': '0 4px 12px -2px rgb(3 7 18 / 0.55)',
    'lg': '0 12px 32px -8px rgb(3 7 18 / 0.6)',
    'glow-primary': '0 0 20px rgb(59 130 246 / 0.30), 0 0 40px rgb(59 130 246 / 0.10)',
    'glow-accent': '0 0 20px rgb(34 211 238 / 0.30), 0 0 40px rgb(34 211 238 / 0.10)',
    'glow-success': '0 0 20px rgb(16 185 129 / 0.30), 0 0 40px rgb(16 185 129 / 0.10)',
    'glow-warning': '0 0 20px rgb(234 179 8 / 0.30), 0 0 40px rgb(234 179 8 / 0.10)',
    'glow-destructive': '0 0 20px rgb(239 68 68 / 0.30), 0 0 40px rgb(239 68 68 / 0.10)',
  },

  zIndex: {
    'base': '0',
    'raised': '10',
    'sticky': '20',
    'dropdown': '30',
    'overlay': '40',
    'modal': '50',
    'popover': '60',
    'tooltip': '70',
    'toast': '80',
  },
};

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/layouts/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: { extend: themeExtend },
  plugins: [],
};

export default config;
