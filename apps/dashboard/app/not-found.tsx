import Link from 'next/link';

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
        color: '#334155',
        background: '#f8fafc',
      }}
    >
      <h1 style={{ fontSize: '4rem', fontWeight: 700, margin: 0, color: '#0f172a' }}>404</h1>
      <p style={{ fontSize: '1.125rem', marginTop: '0.5rem' }}>Page not found.</p>
      <Link
        href="/overview"
        style={{
          marginTop: '1.5rem',
          padding: '0.5rem 1.25rem',
          borderRadius: '0.5rem',
          background: '#0f172a',
          color: '#fff',
          textDecoration: 'none',
          fontSize: '0.875rem',
          fontWeight: 500,
        }}
      >
        Go to Dashboard
      </Link>
    </div>
  );
}
