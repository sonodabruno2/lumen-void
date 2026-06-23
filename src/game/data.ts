export type Category =
  | 'dmg' | 'rate' | 'count' | 'range' | 'crit' | 'hp' | 'heal'
  | 'radius' | 'util' | 'burn' | 'freeze' | 'knock' | 'armor'

export interface UpgradeNode {
  id: string
  name: string
  desc: string
  cat: Category
  baseCost: number
  requires?: string  // id do nó-pai (deve ter nível >= 1) — também desenha a conexão da árvore
  tier?: number      // profundidade (linha) no layout da árvore
  nx?: number        // posição horizontal 0..1 no layout da árvore
}

export interface Branch {
  name: string
  color: string
  role?: string
  nodes: UpgradeNode[]
}

export interface MapDef {
  id: string
  name: string
  waves: number
  diff: number
  hpMul: number
  spawnMul: number
  speedMul: number
  palette: { void: string; glow: string; accent: string }
}

export type ForceKey = 'storm' | 'volcano' | 'forest' | 'frost' | 'terra'

export const ORDER: ForceKey[] = ['storm', 'volcano', 'forest', 'frost', 'terra']

// BASE — ÁRVORE ramificada da Luz. Foco é a raiz; após ele, bifurca em dois caminhos
// (ofensivo: Pulso → perfuração/crítico ; defensivo: Casca → regen/aura). Pontas com mecânicas novas.
export const BASE: Branch = {
  name: 'Luz', color: '#ffe6b0',
  nodes: [
    { id: 'b_dmg',     name: 'Foco',       desc: '+1 de dano do tiro de luz',                    cat: 'dmg',    baseCost: 8,                       tier: 0, nx: 0.5 },
    // bifurcação principal
    { id: 'b_rate',    name: 'Pulso',      desc: 'Dispara com mais frequência',                  cat: 'rate',   baseCost: 10, requires: 'b_dmg',   tier: 1, nx: 0.28 },
    { id: 'b_hp',      name: 'Casca',      desc: '+10 de integridade (vida) máxima',             cat: 'hp',     baseCost: 10, requires: 'b_dmg',   tier: 1, nx: 0.72 },
    // tier 2 — ofensivo (de Pulso) / defensivo (de Casca)
    { id: 'b_pierce',  name: 'Perfuração', desc: 'Atravessa +1 inimigo (dano cresce por nível)', cat: 'count',  baseCost: 14, requires: 'b_rate',  tier: 2, nx: 0.12 },
    { id: 'b_crit',    name: 'Lampejo',    desc: '+10% de chance de crítico (x2 de dano)',       cat: 'crit',   baseCost: 12, requires: 'b_rate',  tier: 2, nx: 0.38 },
    { id: 'b_regen',   name: 'Alento',     desc: 'Regenera integridade aos poucos',              cat: 'heal',   baseCost: 11, requires: 'b_hp',    tier: 2, nx: 0.62 },
    { id: 'b_area',    name: 'Aura',       desc: 'Dano contínuo de luz ao redor do núcleo',      cat: 'radius', baseCost: 12, requires: 'b_hp',    tier: 2, nx: 0.88 },
    // tier 3 — mecânicas novas nas pontas
    { id: 'b_proj',    name: 'Impulso',    desc: 'Projétil mais veloz (alcança o alvo antes)',   cat: 'util',   baseCost: 10, requires: 'b_pierce',tier: 3, nx: 0.12 },
    { id: 'b_shatter', name: 'Estilhaço',  desc: 'Abate de luz explode em área, ferindo ao redor',cat: 'burn',  baseCost: 16, requires: 'b_crit',  tier: 3, nx: 0.38 },
    { id: 'b_leech',   name: 'Sanguessuga',desc: 'Recupera integridade a cada abate',            cat: 'heal',   baseCost: 13, requires: 'b_regen', tier: 3, nx: 0.62 },
    { id: 'b_range',   name: 'Alcance',    desc: '+44 de alcance do círculo de tiro',            cat: 'range',  baseCost: 9,  requires: 'b_area',  tier: 3, nx: 0.88 },
    // capstone
    { id: 'b_luz',     name: 'Coleta',     desc: '+1 de luz (✦) por abate',                      cat: 'util',   baseCost: 9,  requires: 'b_range', tier: 4, nx: 0.7 },
  ],
}

export const PATHS: Record<ForceKey, Branch> = {
  storm: {
    name: 'Storm', color: '#6aa8ff', role: 'Cadência e raios em cadeia', nodes: [
      { id: 'storm_volt',  name: 'Voltagem',   desc: '+5 de dano do raio',   cat: 'dmg',   baseCost: 9  },
      { id: 'storm_cad',   name: 'Cadência',   desc: 'Dispara mais rápido',  cat: 'rate',  baseCost: 11, requires: 'storm_volt'  },
      { id: 'storm_chain', name: 'Cadeia',     desc: '+1 alvo em cadeia',    cat: 'count', baseCost: 12, requires: 'storm_cad'   },
      { id: 'storm_range', name: 'Alcance',    desc: '+42 de alcance',       cat: 'range', baseCost: 8,  requires: 'storm_chain' },
      { id: 'storm_over',  name: 'Sobrecarga', desc: '+12% de crítico (x2)', cat: 'crit',  baseCost: 10, requires: 'storm_range' },
    ],
  },
  volcano: {
    name: 'Volcano', color: '#ff8a4c', role: 'Explosões e queimadura em área', nodes: [
      { id: 'vol_pow',  name: 'Erupção', desc: '+8 de dano da explosão',  cat: 'dmg',    baseCost: 9  },
      { id: 'vol_rate', name: 'Fúria',   desc: 'Explode mais rápido',     cat: 'rate',   baseCost: 11, requires: 'vol_pow'  },
      { id: 'vol_rad',  name: 'Cratera', desc: '+14 de raio',             cat: 'radius', baseCost: 8,  requires: 'vol_rate' },
      { id: 'vol_burn', name: 'Brasa',   desc: '+3 de queimadura/s',      cat: 'burn',   baseCost: 9,  requires: 'vol_rad'  },
      { id: 'vol_zone', name: 'Lava',    desc: '+0,8s de poça de lava',   cat: 'burn',   baseCost: 8,  requires: 'vol_burn' },
    ],
  },
  forest: {
    name: 'Forest', color: '#74e3a0', role: 'Cura e aura de espinhos', nodes: [
      { id: 'for_thorn', name: 'Espinhos',    desc: '+4 de dano da aura',   cat: 'dmg',    baseCost: 9  },
      { id: 'for_root',  name: 'Raízes',      desc: '+24 de raio da aura',  cat: 'radius', baseCost: 8,  requires: 'for_thorn' },
      { id: 'for_heal',  name: 'Seiva',       desc: '+3 de cura',           cat: 'heal',   baseCost: 9,  requires: 'for_root'  },
      { id: 'for_regen', name: 'Regeneração', desc: 'Cura mais rápido',     cat: 'heal',   baseCost: 10, requires: 'for_heal'  },
      { id: 'for_vigor', name: 'Vigor',       desc: '+8 integridade máx',   cat: 'hp',     baseCost: 10, requires: 'for_regen' },
    ],
  },
  frost: {
    name: 'Frost', color: '#bfeaff', role: 'Lentidão, congelamento e defesa', nodes: [
      { id: 'fro_cold',   name: 'Frio',      desc: '+12% de lentidão',      cat: 'freeze', baseCost: 9  },
      { id: 'fro_nova',   name: 'Nova',      desc: '+7 de dano da nova',    cat: 'dmg',    baseCost: 9,  requires: 'fro_cold'   },
      { id: 'fro_freeze', name: 'Congelar',  desc: '+0,3s de congelamento', cat: 'freeze', baseCost: 10, requires: 'fro_nova'   },
      { id: 'fro_crys',   name: 'Cristal',   desc: '+25 de raio da nova',   cat: 'radius', baseCost: 8,  requires: 'fro_freeze' },
      { id: 'fro_barr',   name: 'Barreira',  desc: '+6% de redução de dano',cat: 'armor',  baseCost: 11, requires: 'fro_crys'  },
    ],
  },
  terra: {
    name: 'Terra', color: '#d8b274', role: 'Tremores, recuo e armadura', nodes: [
      { id: 'ter_imp',    name: 'Impacto',   desc: '+8 de dano do tremor',  cat: 'dmg',    baseCost: 9  },
      { id: 'ter_quake',  name: 'Terremoto', desc: 'Tremores mais rápidos', cat: 'rate',   baseCost: 11, requires: 'ter_imp'    },
      { id: 'ter_knock',  name: 'Empurrão',  desc: '+25 de recuo',          cat: 'knock',  baseCost: 8,  requires: 'ter_quake'  },
      { id: 'ter_wall',   name: 'Muralha',   desc: '+7% de redução de dano',cat: 'armor',  baseCost: 11, requires: 'ter_knock'  },
      { id: 'ter_weight', name: 'Peso',      desc: '+30 de raio do tremor', cat: 'radius', baseCost: 8,  requires: 'ter_wall'   },
    ],
  },
}

// 7 biomas — dificuldade e nº de ondas crescem a cada mapa (+1 onda por mapa)
export const MAPS: MapDef[] = [
  { id: 'clareira',   name: 'Clareira Esquecida',   waves: 5,  diff: 1, hpMul: 1.0,  spawnMul: 1.0,  speedMul: 1.0,
    palette: { void: '#0c1410', glow: '#2f7048', accent: '#6fe09b' } },
  { id: 'caldeira',   name: 'Caldeira Cinza',       waves: 6,  diff: 2, hpMul: 1.35, spawnMul: 1.18, speedMul: 1.1,
    palette: { void: '#150d0a', glow: '#7a3717', accent: '#ff8a4c' } },
  { id: 'abismo',     name: 'Abismo Glacial',       waves: 7,  diff: 3, hpMul: 1.75, spawnMul: 1.38, speedMul: 1.2,
    palette: { void: '#0a1018', glow: '#24477a', accent: '#86c4ff' } },
  { id: 'dunas',      name: 'Dunas do Eco',         waves: 8,  diff: 4, hpMul: 2.2,  spawnMul: 1.6,  speedMul: 1.32,
    palette: { void: '#14110a', glow: '#7a5a1e', accent: '#e8c074' } },
  { id: 'tempestade', name: 'Tempestade Suspensa',  waves: 9,  diff: 5, hpMul: 2.7,  spawnMul: 1.85, speedMul: 1.44,
    palette: { void: '#0d0a16', glow: '#3a2f7a', accent: '#9a8aff' } },
  { id: 'pantano',    name: 'Pântano Umbroso',      waves: 10, diff: 6, hpMul: 3.3,  spawnMul: 2.1,  speedMul: 1.56,
    palette: { void: '#0a1410', glow: '#1e6a52', accent: '#5fe0b0' } },
  { id: 'vazio',      name: 'Coração do Vazio',     waves: 11, diff: 7, hpMul: 4.0,  spawnMul: 2.4,  speedMul: 1.7,
    palette: { void: '#160a12', glow: '#6a1e3a', accent: '#ff6a8a' } },
]

export type Difficulty = 'Tranquilo' | 'Equilibrado' | 'Implacável'
export const DIFF: Record<Difficulty, number> = { Tranquilo: 1.0, Equilibrado: 1.4, Implacável: 1.9 }

export type EnemyType = 'basic' | 'fast' | 'tank' | 'boss'
export const ENEMY_CFG: Record<EnemyType, { hp: number; r: number; sp: number; dps: number; coin: number; rim: string }> = {
  basic: { hp: 1,  r: 12, sp: 15, dps: 10, coin: 1, rim: '#5a6b86' },
  fast:  { hp: 1,  r: 9,  sp: 30, dps: 8,  coin: 1, rim: '#7d6ba0' },
  tank:  { hp: 5,  r: 18, sp: 9,  dps: 18, coin: 2, rim: '#86705a' },
  boss:  { hp: 22, r: 38, sp: 9,  dps: 30, coin: 15, rim: '#c0607a' },
}
