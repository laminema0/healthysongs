/** Dark-first, calm. One accent for the person, one for the system. */
export const T = {
  bg: '#0F1413',
  surface: '#171E1C',
  surface2: '#1F2826',
  line: '#2A3532',
  ink: '#E9ECE8',
  muted: '#8E9C96',
  faint: '#5C6B65',
  accent: '#5FB8B0',     // you (readings, check-ins)
  accent2: '#B195DA',    // the system (journey path, targets)
  warm: '#E0A458',
  danger: '#D97A6B',
  radius: 14,
  pad: 20,
} as const;

export const font = {
  display: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.5, color: T.ink },
  title: { fontSize: 20, fontWeight: '600' as const, color: T.ink },
  body: { fontSize: 16, lineHeight: 23, color: T.ink },
  small: { fontSize: 13, lineHeight: 18, color: T.muted },
  label: { fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' as const, color: T.muted, fontWeight: '600' as const },
  mono: { fontFamily: 'monospace' as const, fontSize: 12, color: T.muted },
};
