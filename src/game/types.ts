import type { EnemyType, ForceKey } from './data'

export type Screen =
  | 'title' | 'map' | 'game' | 'upgrade' | 'pause' | 'victory' | 'defeat' | 'poderes' | 'lab'

export interface Enemy {
  x: number; y: number; type: EnemyType
  force?: ForceKey // inimigo da cor de uma força — dropa moeda dessa força
  r: number; sp: number; dps: number; coin: number; rim: string
  hp: number; maxhp: number
  flash: number; freeze: number; fade: number
  burn: { dps: number; dur: number } | null
  vx: number; vy: number; slowF: number; boss: boolean
  dead?: boolean
}

export interface Shot {
  x: number; y: number; px: number; py: number
  vx: number; vy: number; dmg: number; crit: number; life: number
  pierce: number; pierceMul: number; hits: number; hit: Enemy[]
  target?: Enemy // alvo previsto (para somar o dano já a caminho e evitar overkill)
  dead?: boolean
}

export interface Zone { x: number; y: number; r: number; dps: number; dur: number }

export interface Fx {
  type: 'death' | 'spark' | 'bolt' | 'boom' | 'nova' | 'wave' | 'heal' | 'coin' | 'dmg' | 'shock'
  x?: number; y?: number; r?: number; life: number; max: number
  sx?: number; sy?: number // posição inicial (para a moeda voar até o contador)
  dx?: number; dy?: number // direção do empurrão (hit fatal) no início do voo da moeda
  color?: string; pts?: { x: number; y: number }[]
  text?: string
}

export interface Shard {
  x: number; y: number
  vx: number; vy: number
  r: number; dmg: number; dmgDealt?: boolean
  life: number; max: number
  color: string; dead?: boolean
}

export interface Mote { x: number; y: number; vx: number; vy: number; sz: number; ph: number }

export interface Run {
  mapIdx: number
  wave: number
  up: Record<string, number>
  coins: number
  hp: number
  maxHP: number
  kills: number
  time: number
  dmgMul: number
  dmgByPath: Record<string, number>
  hpMul: number
  speedMul: number
  dmgMulE: number
  tBasic: number; tStorm: number; tVol: number; tFrost: number; tTerra: number; tForest: number
}

export interface Summary {
  win: boolean
  wave: number
  waves: number
  kills: number
  time: string
  selo: boolean
  final?: boolean // venceu a ÚLTIMA fase → fim de jogo (tela de encerramento)
  dmg: { name: string; color: string; pct: number }[]
}

/** State the engine surfaces to React for the HUD/screens. */
export interface PublicState {
  screen: Screen
  unlocked: number
  tokens: number
  unlockedForces: ForceKey[]
  bossesBeaten: Record<string, boolean>
  run: Run | null
  summary: Summary | null
}
