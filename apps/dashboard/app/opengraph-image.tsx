import { ImageResponse } from 'next/og';

export const alt = 'Apployd - Managed SaaS Deployment Platform';
export const runtime = 'edge';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '56px',
          background:
            'radial-gradient(circle at 10% 10%, #1e293b 0%, #0f172a 45%, #020617 100%)',
          color: '#f8fafc',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            fontSize: '30px',
            fontWeight: 700,
            letterSpacing: '-0.02em',
          }}
        >
          <div
            style={{
              width: '20px',
              height: '20px',
              borderRadius: '999px',
              background: '#38bdf8',
              boxShadow: '0 0 0 8px rgba(56, 189, 248, 0.16)',
            }}
          />
          Apployd
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div
            style={{
              fontSize: '68px',
              lineHeight: 1.03,
              fontWeight: 800,
              letterSpacing: '-0.04em',
              maxWidth: '980px',
            }}
          >
            Managed SaaS Deployment Platform
          </div>
          <div
            style={{
              fontSize: '30px',
              color: '#cbd5e1',
              lineHeight: 1.35,
              maxWidth: '980px',
            }}
          >
            Deploy apps from Git with preview environments, custom domains, and production-grade runtime controls.
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: '24px',
            color: '#94a3b8',
            letterSpacing: '0.02em',
          }}
        >
          apployd.com
        </div>
      </div>
    ),
    size,
  );
}
