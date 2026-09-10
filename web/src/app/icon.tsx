import { ImageResponse } from 'next/og';

export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#12201a',
          borderRadius: 14,
          border: '2px solid #4a3f2e',
        }}
      >
        <span
          style={{
            fontSize: 38,
            fontWeight: 700,
            color: '#d9a441',
            fontFamily: 'Georgia, serif',
          }}
        >
          U
        </span>
      </div>
    ),
    { ...size }
  );
}
