import type { ReactNode } from 'react';

/**
 * Frame comum das imagens Open Graph (1200×630, tema escuro do site).
 * Coes com `assets-src/figma/design-tokens.json` (ink-950, cyan-400, blue-400).
 */
export interface OgFrameProps {
  eyebrow: string;
  title: string;
  subtitle?: string;
  footer?: string;
}

const page: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  backgroundColor: '#0B1220',
  backgroundImage:
    'radial-gradient(circle at 15% 20%, rgba(34,211,238,0.16), transparent 45%), radial-gradient(circle at 85% 80%, rgba(96,165,250,0.14), transparent 45%)',
  padding: 72,
  fontFamily: "'Noto Sans', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
};

const eyebrowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  color: '#22D3EE',
  fontSize: 30,
  fontWeight: 600,
  letterSpacing: 2,
  textTransform: 'uppercase',
};

const titleStyle: React.CSSProperties = {
  color: '#F5F8FF',
  fontSize: 68,
  fontWeight: 700,
  lineHeight: 1.1,
  margin: 0,
  maxWidth: 1000,
};

const subtitleStyle: React.CSSProperties = {
  color: '#B7C4DB',
  fontSize: 30,
  fontWeight: 400,
  lineHeight: 1.35,
  marginTop: 24,
  maxWidth: 960,
};

const footerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  color: '#93A4C0',
  fontSize: 26,
};

const brandStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  color: '#E6EDF7',
  fontSize: 28,
  fontWeight: 600,
};

const shieldStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 10,
  backgroundColor: 'rgba(34,211,238,0.15)',
  border: '2px solid #22D3EE',
};

export function OgFrame({ eyebrow, title, subtitle, footer }: OgFrameProps): ReactNode {
  return (
    <div style={page}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={eyebrowStyle}>
          <div style={shieldStyle} />
          {eyebrow}
        </div>
        <h1 style={titleStyle}>{title}</h1>
        {subtitle ? <p style={subtitleStyle}>{subtitle}</p> : null}
      </div>
      <div style={footerStyle}>
        <div style={brandStyle}>Blue-Sentinel</div>
        <span>{footer ?? 'Cybersecurity · Blue Team'}</span>
      </div>
    </div>
  );
}
