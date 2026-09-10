import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#12201a',
          backgroundImage:
            'radial-gradient(ellipse 90% 60% at 50% -10%, #24352a 0%, transparent 60%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 120,
            height: 120,
            borderRadius: 20,
            border: '3px solid #4a3f2e',
            background: '#241f19',
            marginBottom: 40,
          }}
        >
          <span style={{ fontSize: 68, fontWeight: 700, color: '#d9a441', fontFamily: 'Georgia, serif' }}>U</span>
        </div>
        <div style={{ display: 'flex', fontSize: 88, fontWeight: 700, color: '#f0c674', fontFamily: 'Georgia, serif', letterSpacing: 4 }}>
          UNDERCOVER
        </div>
        <div style={{ display: 'flex', marginTop: 28, fontSize: 34, color: '#ede6d6', fontFamily: 'Georgia, serif' }}>
          Trouve les infiltrés avant qu&apos;ils ne te démasquent
        </div>
      </div>
    ),
    { ...size }
  );
}
