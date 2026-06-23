export function withA(hex: string, a: number) {
  const x = parseInt(hex.slice(1), 16)
  return `rgba(${(x >> 16) & 255},${(x >> 8) & 255},${x & 255},${a})`
}
