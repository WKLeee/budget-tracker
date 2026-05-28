import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

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
          background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
        }}
      >
        <div
          style={{
            position: 'relative',
            display: 'flex',
            width: '60%',
            height: '44%',
            background: 'white',
            borderRadius: 22,
          }}
        >
          <div
            style={{
              position: 'absolute',
              right: '12%',
              top: '35%',
              width: '22%',
              height: '30%',
              background: '#4338ca',
              borderRadius: 9999,
            }}
          />
        </div>
      </div>
    ),
    { ...size }
  )
}
