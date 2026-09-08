import { lazy, Suspense } from 'react';

const VideoTemplate = lazy(() => import('./VideoTemplate'));

export default function TrailerPlayer({ className }: { className?: string }) {
  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 720,
        margin: '0 auto',
        aspectRatio: '16/9',
        overflow: 'hidden',
        borderRadius: 12,
        border: '1px solid rgba(56,189,248,0.18)',
        boxShadow: '0 0 60px rgba(56,189,248,0.08), 0 0 120px rgba(16,185,129,0.04)',
      }}
    >
      <Suspense
        fallback={
          <div
            style={{
              width: '100%',
              height: '100%',
              background: '#09090b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#38bdf8',
              fontFamily: "var(--font-sans)",
              fontSize: '0.75rem',
              letterSpacing: '0.15em',
            }}
          >
            LOADING TRAILER...
          </div>
        }
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          <VideoTemplate />
        </div>
      </Suspense>
    </div>
  );
}
