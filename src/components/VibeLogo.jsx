const SIZES = {
  sm: {
    vibeFontSize: '0.85rem',
    spineWidth: '4px',
    spineHeight: '1.1rem',
    readingFontSize: '1rem',
  },
  lg: {
    vibeFontSize: '1.8rem',
    spineWidth: '5px',
    spineHeight: '2.2rem',
    readingFontSize: '2.2rem',
  },
}

const THEMES = {
  light: {
    vibeColor: 'white',
    spineColor: 'white',
    readingColor: 'white',
  },
  dark: {
    vibeColor: '#1A1A1A',
    spineColor: '#FF6B2B',
    readingColor: '#1A1A1A',
  },
}

export default function VibeLogo({ size = 'sm', theme = 'dark' }) {
  const s = SIZES[size]
  const t = THEMES[theme]

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4em' }}>
      <span
        style={{
          fontFamily: 'Inter, system-ui, sans-serif',
          fontWeight: 800,
          fontSize: s.vibeFontSize,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: t.vibeColor,
          lineHeight: 1,
        }}
      >
        VIBE
      </span>

      <span
        style={{
          display: 'inline-block',
          width: s.spineWidth,
          height: s.spineHeight,
          borderRadius: '1px',
          backgroundColor: t.spineColor,
          flexShrink: 0,
        }}
      />

      <span
        style={{
          fontFamily: 'Georgia, serif',
          fontStyle: 'italic',
          fontSize: s.readingFontSize,
          color: t.readingColor,
          lineHeight: 1,
        }}
      >
        Reading
      </span>
    </div>
  )
}
