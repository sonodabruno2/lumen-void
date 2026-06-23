import type { Category, ForceKey } from '../game/data'

type IconKey = ForceKey | 'core'

/** Force badge icon (title/powers/upgrade branch header). */
export function ForceIcon({ kind, color, size = 20 }: { kind: IconKey; color: string; size?: number }) {
  const common = { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: color, strokeWidth: 1.9, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }
  switch (kind) {
    case 'storm': return <svg {...common}><path d="M13 2 L5 13 L11 13 L10 22 L19 10 L13 10 Z" fill={color} stroke="none" /></svg>
    case 'volcano': return <svg {...common}><path d="M4 20 L9 7 L13 7 L20 20 Z" /><path d="M9.5 7 L11 11 L13 7" /></svg>
    case 'forest': return <svg {...common}><path d="M12 3 C6 8 6 16 12 21 C18 16 18 8 12 3 Z" /><line x1={12} y1={8} x2={12} y2={18} /></svg>
    case 'frost': return <svg {...common}><line x1={12} y1={2} x2={12} y2={22} /><line x1={3.8} y1={7} x2={20.2} y2={17} /><line x1={20.2} y1={7} x2={3.8} y2={17} /></svg>
    case 'terra': return <svg {...common}><path d="M12 3 L20 8 L20 16 L12 21 L4 16 L4 8 Z" /></svg>
    default: return <svg {...common}><path d="M12 3 L14 10 L21 12 L14 14 L12 21 L10 14 L3 12 L10 10 Z" fill={color} stroke="none" /></svg>
  }
}

/** Per-upgrade category icon. */
export function UpIcon({ cat, color, size = 20 }: { cat: Category; color: string; size?: number }) {
  const common = { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }
  switch (cat) {
    case 'dmg': return <svg {...common}><path d="M12 3 L14 10 L21 12 L14 14 L12 21 L10 14 L3 12 L10 10 Z" fill={color} stroke="none" /></svg>
    case 'rate': return <svg {...common}><path d="M5 6 L11 12 L5 18" /><path d="M12 6 L18 12 L12 18" /></svg>
    case 'count': return <svg {...common}><circle cx={6} cy={12} r={1.8} fill={color} stroke="none" /><circle cx={12} cy={12} r={1.8} fill={color} stroke="none" /><circle cx={18} cy={12} r={1.8} fill={color} stroke="none" /></svg>
    case 'range': return <svg {...common}><circle cx={12} cy={12} r={8} /><circle cx={12} cy={12} r={2} fill={color} stroke="none" /></svg>
    case 'crit': return <svg {...common}><path d="M12 3 L14.3 9 L20.8 9.4 L15.8 13.6 L17.4 20 L12 16.3 L6.6 20 L8.2 13.6 L3.2 9.4 L9.7 9 Z" /></svg>
    case 'hp': return <svg {...common}><path d="M12 3 L20 6 V12 C20 17 16 20 12 21 C8 20 4 17 4 12 V6 Z" /></svg>
    case 'heal': return <svg {...common} strokeWidth={2.4}><line x1={12} y1={6} x2={12} y2={18} /><line x1={6} y1={12} x2={18} y2={12} /></svg>
    case 'radius': return <svg {...common}><circle cx={12} cy={12} r={4} /><circle cx={12} cy={12} r={8.5} /></svg>
    case 'util': return <svg {...common}><path d="M12 3 L19 12 L12 21 L5 12 Z" /><circle cx={12} cy={12} r={2} fill={color} stroke="none" /></svg>
    case 'burn': return <svg {...common}><path d="M12 21 C7 19 7 13 11 10 C10 13.5 13 13.5 12 8.5 C16.5 12 17 18 12 21 Z" fill={color} stroke="none" /></svg>
    case 'freeze': return <svg {...common}><line x1={12} y1={3} x2={12} y2={21} /><line x1={4.5} y1={7.5} x2={19.5} y2={16.5} /><line x1={19.5} y1={7.5} x2={4.5} y2={16.5} /></svg>
    case 'knock': return <svg {...common}><line x1={4} y1={12} x2={16} y2={12} /><path d="M12 7 L17 12 L12 17" /></svg>
    case 'armor': return <svg {...common}><path d="M12 3 L20 6 V12 C20 17 16 20 12 21 C8 20 4 17 4 12 V6 Z" /><line x1={12} y1={8} x2={12} y2={16} /></svg>
    default: return <svg {...common}><circle cx={12} cy={12} r={7} /></svg>
  }
}
