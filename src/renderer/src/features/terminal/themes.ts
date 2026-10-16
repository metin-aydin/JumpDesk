import type { ITheme } from '@xterm/xterm'
import type { ResolvedTheme } from '@shared/types'

const dark: ITheme = {
  background: '#0f1218',
  foreground: '#d6dbe6',
  cursor: '#e4e7ee',
  cursorAccent: '#0f1218',
  selectionBackground: '#4f8cff4d',
  selectionInactiveBackground: '#4f8cff26',
  scrollbarSliderBackground: '#8a93a633',
  scrollbarSliderHoverBackground: '#8a93a666',
  scrollbarSliderActiveBackground: '#8a93a680',
  black: '#1b1f2a',
  red: '#f0605d',
  green: '#3fb68b',
  yellow: '#e0a458',
  blue: '#5c9dff',
  magenta: '#c678dd',
  cyan: '#3fc1c9',
  white: '#c9cfdb',
  brightBlack: '#5c6578',
  brightRed: '#ff7b78',
  brightGreen: '#5fd3a4',
  brightYellow: '#f2c078',
  brightBlue: '#82b4ff',
  brightMagenta: '#d89bf0',
  brightCyan: '#6ad7dd',
  brightWhite: '#ffffff'
}

const light: ITheme = {
  background: '#ffffff',
  foreground: '#1f2430',
  cursor: '#2f6fed',
  cursorAccent: '#ffffff',
  selectionBackground: '#2f6fed33',
  selectionInactiveBackground: '#2f6fed1a',
  scrollbarSliderBackground: '#68708333',
  scrollbarSliderHoverBackground: '#68708366',
  scrollbarSliderActiveBackground: '#68708380',
  black: '#24292f',
  red: '#cf222e',
  green: '#116329',
  yellow: '#7d4e00',
  blue: '#0969da',
  magenta: '#8250df',
  cyan: '#1b7c83',
  white: '#6e7781',
  brightBlack: '#57606a',
  brightRed: '#a40e26',
  brightGreen: '#1a7f37',
  brightYellow: '#633c01',
  brightBlue: '#218bff',
  brightMagenta: '#a475f9',
  brightCyan: '#3192aa',
  brightWhite: '#8c959f'
}

export function terminalTheme(theme: ResolvedTheme): ITheme {
  return theme === 'dark' ? dark : light
}
