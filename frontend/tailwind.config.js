/** @type {import('tailwindcss').Config}
 *
 * Espelho de `assets-src/figma/tailwind.config.snippet.ts`, que é gerado a partir
 * de `assets-src/figma/design-tokens.json`.
 * Regenerar: .venv/Scripts/python.exe scripts/build_design_tokens.py
 *
 * Regra: colors, fontSize, borderRadius, screens, transition*, boxShadow e zIndex
 * vêm do JSON. animation/keyframes/backgroundImage são específicos do código.
 */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/layouts/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        link: {
          DEFAULT: 'hsl(var(--link))',
          hover: 'hsl(var(--link-hover))',
        },
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
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
          hover: 'hsl(var(--secondary-hover))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
          hover: 'hsl(var(--success-hover))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
          hover: 'hsl(var(--warning-hover))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
          hover: 'hsl(var(--destructive-hover))',
        },
        critical: {
          DEFAULT: 'hsl(var(--critical))',
          text: 'hsl(var(--critical-text))',
          subtle: '#EF44441A',
        },
        high: {
          DEFAULT: 'hsl(var(--high))',
          text: 'hsl(var(--high-text))',
          subtle: '#F973161A',
        },
        medium: {
          DEFAULT: 'hsl(var(--medium))',
          text: 'hsl(var(--medium-text))',
          subtle: '#EAB3081A',
        },
        low: {
          DEFAULT: 'hsl(var(--low))',
          text: 'hsl(var(--low-text))',
          subtle: '#3B82F61A',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
      },
      borderRadius: {
        none: '0',
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '24px',
        full: '9999px',
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
        body: ['1rem', { lineHeight: '1.6', letterSpacing: '0' }],
        'body-sm': ['0.875rem', { lineHeight: '1.6', letterSpacing: '0' }],
        caption: ['0.75rem', { lineHeight: '1.6', letterSpacing: '0' }],
        overline: ['0.6875rem', { lineHeight: '1.25', letterSpacing: '0.08em' }],
      },
      screens: {
        xs: '360px',
        sm: '640px',
        md: '768px',
        lg: '1024px',
        xl: '1280px',
        wide: '1440px',
        '2xl': '1536px',
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
        '30': '7.5rem',
      },
      transitionDuration: {
        instant: '0ms',
        micro: '150ms',
        fast: '200ms',
        normal: '300ms',
        slow: '400ms',
        deliberate: '500ms',
        entrance: '600ms',
        hero: '700ms',
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
        out: 'cubic-bezier(0, 0, 0.2, 1)',
        in: 'cubic-bezier(0.4, 0, 1, 1)',
        'expo-out': 'cubic-bezier(0.19, 1, 0.22, 1)',
        spring: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      },
      zIndex: {
        base: '0',
        raised: '10',
        sticky: '20',
        dropdown: '30',
        overlay: '40',
        modal: '50',
        popover: '60',
        tooltip: '70',
        toast: '80',
      },
      boxShadow: {
        none: 'none',
        sm: '0 1px 2px 0 rgb(3 7 18 / 0.5)',
        md: '0 4px 12px -2px rgb(3 7 18 / 0.55)',
        lg: '0 12px 32px -8px rgb(3 7 18 / 0.6)',
        glow: '0 0 20px rgb(59 130 246 / 0.30), 0 0 40px rgb(59 130 246 / 0.10)',
        'glow-primary': '0 0 20px rgb(59 130 246 / 0.30), 0 0 40px rgb(59 130 246 / 0.10)',
        'glow-accent': '0 0 20px rgb(34 211 238 / 0.30), 0 0 40px rgb(34 211 238 / 0.10)',
        'glow-success': '0 0 20px rgb(16 185 129 / 0.30), 0 0 40px rgb(16 185 129 / 0.10)',
        'glow-warning': '0 0 20px rgb(234 179 8 / 0.30), 0 0 40px rgb(234 179 8 / 0.10)',
        'glow-destructive': '0 0 20px rgb(239 68 68 / 0.30), 0 0 40px rgb(239 68 68 / 0.10)',
        'inner-glow': 'inset 0 0 20px rgb(59 130 246 / 0.10)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'fade-in-up': 'fadeInUp 0.6s ease-out forwards',
        'fade-in-down': 'fadeInDown 0.6s ease-out forwards',
        'slide-in-left': 'slideInLeft 0.6s ease-out forwards',
        'slide-in-right': 'slideInRight 0.6s ease-out forwards',
        'scale-in': 'scaleIn 0.4s ease-out forwards',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        float: 'float 6s ease-in-out infinite',
        'spin-slow': 'spin 8s linear infinite',
        shimmer: 'shimmer 2s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeInDown: {
          '0%': { opacity: '0', transform: 'translateY(-16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInLeft: {
          '0%': { opacity: '0', transform: 'translateX(-24px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(24px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.97)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 20px rgb(59 130 246 / 0.30), 0 0 40px rgb(59 130 246 / 0.10)' },
          '50%': { boxShadow: '0 0 30px rgb(59 130 246 / 0.50), 0 0 60px rgb(59 130 246 / 0.20)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'mesh-gradient':
          'linear-gradient(135deg, rgb(59 130 246 / 0.10) 0%, rgb(34 211 238 / 0.10) 50%, rgb(16 185 129 / 0.10) 100%)',
        noise:
          "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")",
      },
    },
  },
  plugins: [],
};
