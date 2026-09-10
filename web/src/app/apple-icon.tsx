import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
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
        }}
      >
        <span
          style={{
            fontSize: 104,
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
