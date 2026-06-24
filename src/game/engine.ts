import {
  PATHS, MAPS, DIFF, ENEMY_CFG,
  type Difficulty, type ForceKey, type EnemyType, type MapDef,
} from './data'
import type { Enemy, Shot, Zone, Fx, Mote, Run, Summary, Screen, PublicState, Shard } from './types'
import { audio } from './audio'

// Teto de níveis por nó da árvore (cada compra preenche 1 segmento do anel)
export const MAX_LVL = 10

const OPENING_LINES = [
  'Eu preciso salvar este bioma do Vazio.',
  'Mais um bioma a ser salvo. Contem comigo!',
  'Estou aqui. Vamos lutar!',
  'Lutarei até o fim!',
  'A Luz contra o Vazio!',
]
const WAVE_LINES = [
  'Vamos lá! Só mais um pouco.',
  'Aguentem firme!',
  'Estamos quase lá!',
  'Estou aqui por vocês.',
]
const DEATH_LINES = [
  'A escuridão venceu... por ora.',
  'Eu voltarei mais forte.',
  'Isto não acabou. Vou me reerguer.',
  'A Luz nunca se apaga de vez.',
  'Recuo, mas não desisto. Volto já!',
]

export interface EngineOpts {
  difficulty: Difficulty
  particles: boolean
  glow: boolean
}

/**
 * Lumen Void engine. Owns the canvas render loop and all simulation.
 * React subscribes via onChange to mirror screen/run/summary for the UI overlays.
 */
export class Engine {
  opts: EngineOpts
  private onChange: () => void

  screen: Screen = 'title'
  unlocked = 1
  tokens = 1 // ❖ moeda de desbloqueio de CAMINHO: começa com 1 p/ liberar a Luz; chefes dão +1 p/ as forças
  unlockedForces: ForceKey[] = []
  bossesBeaten: Record<string, boolean> = {}
  run: Run | null = null
  summary: Summary | null = null
  private _lastMap = 0

  // Progressão permanente (estilo incremental) — persiste entre runs
  coins = 0
  forceCoins: Record<ForceKey, number> = { storm: 0, volcano: 0, forest: 0, frost: 0, terra: 0 } // moeda própria de cada força
  perm: Record<string, number> = {}
  coreUnlocked = false // 1ª visita às Melhorias: só o núcleo + CTA; após liberar, revela a Árvore da Luz
  speed = 1
  deathLine = '' // frase exibida no topo da tela de morte

  // sim state
  coreR = 26
  t = 0
  fx: Fx[] = []
  motes: Mote[] = []
  enemies: Enemy[] = []
  zones: Zone[] = []
  shots: Shot[] = []
  shards: Shard[] = []
  private _coreFlash = 0
  private _shake = 0
  maxMote = 200
  private toSpawn: { type: EnemyType; force?: ForceKey }[] = []
  private spawnTimer = 0
  private spawnInterval = 1
  private _waveResolved = false

  // camera
  private _zoom = 1.22
  private _zoomTarget = 1.22
  private _camAngle = 0 // offset de scaleX (giro horizontal)
  private _camPulse = 0 // pulsar breve a cada transição de onda
  // brilho do fundo: escuro na onda 1, clareia a cada onda superada (mundo sendo salvo da escuridão)
  private _bgLift = 0
  private _bgLiftTarget = 0
  private _deathProg = 0 // 0 = luz plena; 1 = luz esvaída (morte). Anima a luz se apagando / renascendo
  private _winProg = 0 // vitória: clareia tudo até a luz plena (bioma salvo)
  private _waveNum = 0; private _waveNumT = 0; private _waveNumMax = 0 // número gigante da onda atrás do pilar
  private _coinPulse = 0 // pulsar do contador de moedas ao capturar uma moeda
  // sprites carregados de public/: personagem principal (hero) e background da fase
  heroImg: HTMLImageElement | null = null
  heroReady = false
  bgImg: HTMLImageElement | null = null
  bgReady = false
  private _heroBob = 0 // deslocamento de flutuação (sobe/desce) do personagem
  private _heroTint: HTMLCanvasElement | null = null // cópia tingida do sprite p/ ambientar na paleta
  private _heroTintKey = ''
  // fala do ser de luz
  private _speech = ''
  private _speechT = 0
  private _speechMax = 0
  private say(lines: string[]) { this._speech = lines[Math.floor(Math.random() * lines.length)]; this._speechMax = 3.6; this._speechT = 3.6 }

  // canvas
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private dpr = 1
  W = 0; H = 0; cx = 0; cy = 0

  // loop
  private _mounted = false
  private _last = 0
  private _raf = 0
  private _watch: ReturnType<typeof setInterval> | null = null
  private _ro: ResizeObserver | null = null
  private _rs = () => { this._last = performance.now(); this.resize() }

  constructor(opts: EngineOpts, onChange: () => void) {
    this.opts = opts
    this.onChange = onChange
  }

  getPublicState(): PublicState {
    return {
      screen: this.screen, unlocked: this.unlocked, tokens: this.tokens,
      unlockedForces: [...this.unlockedForces], bossesBeaten: { ...this.bossesBeaten },
      run: this.run, summary: this.summary,
    }
  }
  private setScreen(s: Screen) { this.screen = s; this.onChange() }
  private touch() { this.onChange() }

  // ---------- assets ----------
  // Carrega os PNG/JPG de public/ (personagem e background). Falha silenciosa: o jogo
  // usa o desenho procedural enquanto os arquivos não existirem.
  // Tenta carregar a 1ª URL que existir (robusto a png/jpg/webp). onReady recebe a imagem.
  private loadImg(srcs: string[], onReady: (img: HTMLImageElement) => void): HTMLImageElement {
    const img = new Image()
    let i = 0
    const tryNext = () => { if (i >= srcs.length) return; img.src = srcs[i++] }
    img.onload = () => { onReady(img); try { this.render() } catch { /* */ } }
    img.onerror = () => tryNext()
    tryNext()
    return img
  }
  private loadAssets() {
    const B = import.meta.env.BASE_URL // respeita o base do Vite ('/lumen-void/' no GitHub Pages, '/' no dev)
    if (!this.heroImg) {
      this.heroImg = this.loadImg([`${B}hero.png`, `${B}hero.webp`, `${B}hero.jpg`], () => { this.heroReady = true; this._heroTint = null })
    }
    if (!this.bgImg) {
      this.bgImg = this.loadImg([`${B}fase1.jpg`, `${B}fase1.png`, `${B}fase1.jpeg`, `${B}fase1.webp`], () => { this.bgReady = true })
    }
  }

  // ---------- lifecycle ----------
  mount() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1)
    this._mounted = true
    this.loadAssets()
    this._last = performance.now()
    window.addEventListener('resize', this._rs)
    document.addEventListener('visibilitychange', this._rs)
    window.addEventListener('focus', this._rs)
    window.addEventListener('pointerdown', this._rs, true)
    const tick = (now: number) => {
      if (!this._mounted) return
      this._raf = requestAnimationFrame(tick)
      try { this.frame(now || performance.now()) } catch (e) { console.error('Lumen frame error', e) }
    }
    this._raf = requestAnimationFrame(tick)
    this._watch = setInterval(() => {
      if (!this._mounted) return
      const n = performance.now()
      if (n - this._last > 120) { try { this.frame(n) } catch (e) { console.error('Lumen watchdog error', e) } }
    }, 60)
  }
  unmount() {
    this._mounted = false
    cancelAnimationFrame(this._raf)
    if (this._watch) clearInterval(this._watch)
    window.removeEventListener('resize', this._rs)
    document.removeEventListener('visibilitychange', this._rs)
    window.removeEventListener('focus', this._rs)
    window.removeEventListener('pointerdown', this._rs, true)
    if (this._ro) this._ro.disconnect()
  }

  setCanvas = (el: HTMLCanvasElement | null) => {
    this.canvas = el
    if (el) {
      this.ctx = el.getContext('2d')
      this.resize()
      if (typeof ResizeObserver !== 'undefined') {
        if (this._ro) this._ro.disconnect()
        this._ro = new ResizeObserver(() => this.resize())
        this._ro.observe(el)
      }
    }
  }
  resize() {
    if (!this.canvas || !this.ctx) return
    const r = this.canvas.getBoundingClientRect()
    if (r.width === 0) return
    // Recalcula o DPR aqui para o backing store e o transform sempre baterem
    this.dpr = Math.min(2, window.devicePixelRatio || 1)
    this.W = r.width; this.H = r.height
    this.canvas.width = Math.round(r.width * this.dpr)
    this.canvas.height = Math.round(r.height * this.dpr)
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    this.cx = this.W / 2; this.cy = this.H * 0.46
    if (!this.motes.length) this.initMotes()
    try { this.render() } catch { /* ignore pre-mount render */ }
  }

  // ---------- helpers ----------
  nodeUnlocked(node: { requires?: string }): boolean {
    if (!node.requires) return true
    return this.lvl(node.requires) >= 1
  }
  lvl(id: string) { return Math.min(MAX_LVL, this.perm[id] || 0) }
  has(p: ForceKey) { return this.unlockedForces.indexOf(p) >= 0 }
  dmgMul() { return this.run ? this.run.dmgMul : 1 }
  getMaxHP() { return 10 + this.lvl('b_hp') * 10 + this.lvl('for_vigor') * 8 }
  nodeCost(baseCost: number, id: string) { return Math.round((baseCost || 8) * Math.pow(1.5, this.lvl(id))) }
  private hexToRgb(h: string): [number, number, number] { const x = parseInt(h.slice(1), 16); return [(x >> 16) & 255, (x >> 8) & 255, x & 255] }
  private withA(h: string, a: number) { const c = this.hexToRgb(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})` }
  // Interpola entre duas cores hex (t: 0 = h1, 1 = h2)
  private mix(h1: string, h2: string, t: number, scale = 1) { const a = this.hexToRgb(h1), b = this.hexToRgb(h2); return `rgb(${Math.round((a[0] + (b[0] - a[0]) * t) * scale)},${Math.round((a[1] + (b[1] - a[1]) * t) * scale)},${Math.round((a[2] + (b[2] - a[2]) * t) * scale)})` }
  private blend(arr: string[]) { let r = 0, g = 0, b = 0; arr.forEach(h => { const c = this.hexToRgb(h); r += c[0]; g += c[1]; b += c[2] }); const n = arr.length || 1; return `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})` }
  private beingColor() { return this.unlockedForces.length ? this.blend(this.unlockedForces.map(p => PATHS[p].color)) : '#ffe6b0' }
  fmtTime(s: number) { const m = Math.floor(s / 60), sec = Math.floor(s % 60); return `${m}:${sec < 10 ? '0' : ''}${sec}` }

  // ---------- stats ----------
  // range = raio do círculo de ataque (alvo só dentro dele). projSpeed = velocidade da bala.
  // Início: alcance curto e bala lenta. Crescem via 'Alcance' (b_range) e o nó futuro de velocidade (b_proj).
  basicStats() { const L = (id: string) => this.lvl(id); return { dmg: (1 + L('b_dmg')) * this.dmgMul(), interval: Math.max(0.3, 1.3 - L('b_rate') * 0.2), count: 1, pierce: L('b_pierce') >= 1 ? 1 : 0, pierceMul: L('b_pierce') * 0.2, range: 105 + L('b_range') * 44, projSpeed: 70 + L('b_proj') * 90, crit: L('b_crit') * 0.10, auraDmg: L('b_area') * 4 * this.dmgMul(), auraR: 74 + L('b_area') * 8, regen: L('b_regen') * 1.4 } }
  stormStats() { const L = (id: string) => this.lvl(id); return { dmg: (2 + L('storm_volt') * 2) * this.dmgMul(), interval: Math.max(0.28, 0.9 - L('storm_cad') * 0.12), chain: 2 + L('storm_chain'), range: 180 + L('storm_range') * 42, crit: L('storm_over') * 0.12 } }
  volcanoStats() { const L = (id: string) => this.lvl(id); return { dmg: (3 + L('vol_pow') * 2) * this.dmgMul(), interval: Math.max(0.7, 1.7 - L('vol_rate') * 0.18), radius: 54 + L('vol_rad') * 14, burn: (1 + L('vol_burn') * 1) * this.dmgMul(), zoneDur: 1.4 + L('vol_zone') * 0.8 } }
  forestStats() { const L = (id: string) => this.lvl(id); return { auraDmg: (1 + L('for_thorn') * 1) * this.dmgMul(), auraR: 90 + L('for_root') * 24, heal: 2 + L('for_heal') * 3, healInt: Math.max(0.8, 3 - L('for_regen') * 0.4) } }
  frostStats() { const L = (id: string) => this.lvl(id); return { slow: Math.min(0.75, 0.2 + L('fro_cold') * 0.12), novaDmg: (2 + L('fro_nova') * 2) * this.dmgMul(), freeze: 0.4 + L('fro_freeze') * 0.3, novaR: 112 + L('fro_crys') * 25, slowR: 130, dr: L('fro_barr') * 0.06, novaInt: 2.4 } }
  terraStats() { const L = (id: string) => this.lvl(id); return { dmg: (3 + L('ter_imp') * 2) * this.dmgMul(), interval: Math.max(1.4, 2.4 - L('ter_quake') * 0.2), knock: 60 + L('ter_knock') * 26, dr: L('ter_wall') * 0.07, waveR: 140 + L('ter_weight') * 30 } }
  private dr() { let d = 0; if (this.has('frost')) d += this.frostStats().dr; if (this.has('terra')) d += this.terraStats().dr; return Math.min(0.6, d) }

  // ---------- run lifecycle ----------
  startRun(idx: number) {
    this._lastMap = idx
    // Começa com câmera aproximada e faz zoom-out suave para o jogo
    this._zoom = 1.5; this._zoomTarget = 1.0; this._camAngle = 0
    this._bgLiftTarget = 0; this._waveNumT = 0 // onda 1: fundo escuro (luz cresce suave; _deathProg/_winProg fazem lerp)
    this.run = {
      mapIdx: idx, wave: 1, up: {}, coins: 0, hp: 100, maxHP: 100, kills: 0, time: 0,
      dmgMul: 1, dmgByPath: {}, hpMul: 1, speedMul: 1, dmgMulE: 1,
      tBasic: 0.2, tStorm: 0.3, tVol: 0.6, tFrost: 1.0, tTerra: 0.9, tForest: 1.0,
    }
    this.run.hp = this.getMaxHP()
    this.enemies = []; this.zones = []; this.fx = []; this.shots = []; this.shards = []; this._coreFlash = 0
    this.spawnWave()
    this.say(OPENING_LINES)
    // Pulsar de renascimento do núcleo + onda de luz emanando ao reviver
    this._camPulse = 1; this._shake = Math.max(this._shake, 0.25)
    this.fx.push({ type: 'shock', x: this.cx, y: this.cy, r: Math.max(this.W, this.H) * 0.5, life: 0.75, max: 0.75, color: '#ffe6b0' })
    this.setScreen('game')
  }

  private spawnWave() {
    if (!this.run) return
    const m = MAPS[this.run.mapIdx], w = this.run.wave, dmul = DIFF[this.opts.difficulty] ?? 1
    const tier = this.run.mapIdx // 0..6 — mapas avançados são mais duros
    // Escalonamento: vida/velocidade/contato crescem por onda E por mapa
    this.run.hpMul = m.hpMul * (1 + 0.45 * (w - 1)) * dmul
    this.run.speedMul = m.speedMul * (1 + 0.05 * (w - 1))
    this.run.dmgMulE = dmul * (1 + 0.12 * tier)
    const count = Math.round((5 + w * 3.2) * m.spawnMul)
    this.toSpawn = []
    for (let i = 0; i < count; i++) {
      // proporção de inimigos perigosos cresce com a onda e o mapa
      const r = Math.random()
      const tankCh = (w >= 2 || tier >= 1) ? Math.min(0.42, 0.05 + 0.02 * w + 0.04 * tier) : 0
      const fastCh = Math.min(0.5, 0.12 + 0.025 * w + 0.045 * tier)
      let type: EnemyType = 'basic'
      if (r < tankCh) type = 'tank'
      else if (r < tankCh + fastCh) type = 'fast'
      // ~38% dos inimigos vêm na cor de uma força liberada e dropam a moeda dela
      let force: ForceKey | undefined
      if (this.unlockedForces.length && Math.random() < 0.38) force = this.unlockedForces[Math.floor(Math.random() * this.unlockedForces.length)]
      this.toSpawn.push({ type, force })
    }
    if (w >= m.waves) this.toSpawn.push({ type: 'boss' })
    // Cadência de surgimento: mapa 1 mais calmo; mapas avançados surgem mais rápido
    const si = Math.max(0.26, (this.run.mapIdx === 0 ? 1.0 : 0.8) - w * 0.05 - tier * 0.04)
    this.spawnTimer = 0.3; this.spawnInterval = si; this._waveResolved = false
  }

  private makeEnemy(type: EnemyType, force?: ForceKey): Enemy {
    if (!this.run) throw new Error('no run')
    const m = MAPS[this.run.mapIdx]
    const cfg = ENEMY_CFG[type]
    const hpMul = type === 'boss' ? m.hpMul * (1 + 0.1 * (this.run.wave - 1)) * (this.run.dmgMulE || 1) : this.run.hpMul
    const hp = Math.max(1, Math.round(cfg.hp * hpMul))
    // Surge logo FORA do círculo de alcance (não na borda da tela), com fade-in
    const ang = Math.random() * Math.PI * 2
    const dist = this.basicStats().range + 24 + Math.random() * 60
    const sx = this.cx + Math.cos(ang) * dist
    const sy = this.cy + Math.sin(ang) * dist
    const rim = force ? PATHS[force].color : cfg.rim // cor da força para identificação
    return { x: sx, y: sy, type, force, r: cfg.r, sp: cfg.sp, dps: cfg.dps * (this.run.dmgMulE || 1), coin: cfg.coin, rim, hp, maxhp: hp, flash: 0, freeze: 0, fade: 0, burn: null, vx: 0, vy: 0, slowF: 1, boss: type === 'boss' }
  }

  private damageEnemy(e: Enemy, dmg: number, path?: string, hx?: number, hy?: number, chain = false) {
    if (e.dead || !this.run) return
    e.hp -= dmg; e.flash = 0.12
    if (path) this.run.dmgByPath[path] = (this.run.dmgByPath[path] || 0) + dmg
    audio.play('hit')
    if (e.hp <= 0) {
      e.dead = true; this.run.kills++
      audio.play('kill')
      this.fx.push({ type: 'death', x: e.x, y: e.y, r: e.r, life: 0.4, max: 0.4, color: e.rim })
      // direção do empurrão da moeda: o hit fatal, ou (padrão) para fora do núcleo
      let dx = hx, dy = hy
      if (dx === undefined || dy === undefined) { const ox = e.x - this.cx, oy = e.y - this.cy, om = Math.hypot(ox, oy) || 1; dx = ox / om; dy = oy / om }
      // Recompensa escala com a robustez do inimigo (e.coin: comum 1, tanque 2, chefe 15) × dificuldade da fase
      const diffMul = 1 + 0.5 * (MAPS[this.run.mapIdx].diff - 1) // dif 1..7 → 1.0..4.0
      if (e.force) {
        // inimigo de força → dropa a moeda daquela força (sem b_luz, que é exclusivo da Luz)
        const amt = Math.max(1, Math.round(e.coin * diffMul))
        this.forceCoins[e.force] += amt
        this.fx.push({ type: 'coin', x: e.x, y: e.y, sx: e.x, sy: e.y, dx, dy, life: 1.15, max: 1.15, text: `+${amt} ◈`, color: PATHS[e.force].color })
      } else {
        const amt = Math.max(1, Math.round(e.coin * diffMul * (1 + this.lvl('b_luz'))))
        this.coins += amt
        this.fx.push({ type: 'coin', x: e.x, y: e.y, sx: e.x, sy: e.y, dx, dy, life: 1.15, max: 1.15, text: `+${amt} ✦` })
      }
      if (e.boss) this._shake = 0.5
      // Mecânicas de abate por LUZ (não re-disparam em cadeia)
      if (path === 'base' && !chain) {
        const leech = this.lvl('b_leech')
        if (leech > 0) this.run.hp = Math.min(this.getMaxHP(), this.run.hp + leech) // Sanguessuga: vida ao abater
        const sh = this.lvl('b_shatter')
        if (sh > 0) { // Estilhaço: explosão em área ao abater
          const rad = 46 + sh * 9, ed = (1 + sh) * this.dmgMul()
          this.fx.push({ type: 'boom', x: e.x, y: e.y, r: rad, life: 0.3, max: 0.3, color: '#ffd9a0' })
          for (const o of this.enemies) { if (o.dead || o === e) continue; if (Math.hypot(o.x - e.x, o.y - e.y) < rad + o.r) this.damageEnemy(o, ed, 'base', undefined, undefined, true) }
        }
      }
    }
  }

  // ---------- frame ----------
  private frame(now: number) {
    let dt = (now - this._last) / 1000; this._last = now; if (dt > 0.05) dt = 0.05
    if (this.canvas) { const w = this.canvas.getBoundingClientRect().width; if (!this.W || Math.abs(w - this.W) > 1) this.resize() }
    if (!this.W) return
    // Aceleração (2x/5x) apenas durante o jogo, via sub-passos para manter a física estável
    const steps = this.screen === 'game' ? Math.max(1, this.speed) : 1
    for (let i = 0; i < steps; i++) { this.t += dt; this.update(dt) }
    this.render()
  }

  private update(dt: number) {
    if (this._coreFlash > 0) this._coreFlash -= dt
    if (this._shake > 0) this._shake -= dt
    // Zoom: título aproximado (1.22×); no jogo faz zoom-out suave até 1.0×
    this._zoomTarget = this.screen === 'title' ? 1.22 : 1.0
    this._zoom += (this._zoomTarget - this._zoom) * Math.min(1, dt * 1.1)
    // Rotação horizontal (eixo vertical): leve oscilação de scaleX simulando giro 3D
    const targetSway = this.screen === 'game' ? Math.sin(this.t * 0.16) * 0.06 : 0
    this._camAngle += (targetSway - this._camAngle) * Math.min(1, dt * 0.8)
    this._bgLift += (this._bgLiftTarget - this._bgLift) * Math.min(1, dt * 1.5)
    this._camPulse += (0 - this._camPulse) * Math.min(1, dt * 2.3)
    this._coinPulse += (0 - this._coinPulse) * Math.min(1, dt * 5)
    if (this._speechT > 0) this._speechT -= dt
    // Luz se esvaindo na morte (→1) e renascendo ao voltar pro jogo (→0) — transição suave
    const deathTarget = this.screen === 'defeat' ? 1 : 0
    this._deathProg += (deathTarget - this._deathProg) * Math.min(1, dt * 0.85)
    // Vitória: clareia tudo até a luz plena
    const winTarget = this.screen === 'victory' ? 1 : 0
    this._winProg += (winTarget - this._winProg) * Math.min(1, dt * 0.9)
    if (this._waveNumT > 0) this._waveNumT -= dt
    for (const m of this.motes) {
      m.x += m.vx * dt * 22; m.y += m.vy * dt * 22
      const d = Math.hypot(m.x - this.cx, m.y - this.cy)
      if (d > this.maxMote) { const a = Math.random() * Math.PI * 2, rr = Math.random() * this.maxMote * 0.5; m.x = this.cx + Math.cos(a) * rr; m.y = this.cy + Math.sin(a) * rr }
    }
    for (let i = this.fx.length - 1; i >= 0; i--) { this.fx[i].life -= dt; if (this.fx[i].life <= 0) { if (this.fx[i].type === 'coin') this._coinPulse = 1; this.fx.splice(i, 1) } }

    if (this.screen !== 'game' || !this.run) return
    const run = this.run; run.time += dt

    if (this.toSpawn.length) { this.spawnTimer -= dt; if (this.spawnTimer <= 0) { const s = this.toSpawn.shift()!; this.enemies.push(this.makeEnemy(s.type, s.force)); this.spawnTimer = this.spawnInterval * (0.75 + Math.random() * 0.5) } }

    // weapons
    this.wpBasic(dt)
    if (this.has('storm')) this.wpStorm(dt)
    if (this.has('volcano')) this.wpVolcano(dt)
    if (this.has('frost')) this.wpFrostNova(dt)
    if (this.has('terra')) this.wpTerra(dt)
    if (this.has('forest')) this.wpForestHeal(dt)

    // projectiles
    for (const s of this.shots) {
      s.px = s.x; s.py = s.y; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt
      if (s.x < -20 || s.x > this.W + 20 || s.y < -20 || s.y > this.H + 20 || s.life <= 0) { s.dead = true; continue }
      for (const e of this.enemies) {
        if (e.dead || s.hit.indexOf(e) >= 0) continue
        if (Math.hypot(e.x - s.x, e.y - s.y) < e.r + 5) {
          const crit = Math.random() < s.crit ? 2 : 1
          const mul = s.hits === 0 ? 1 : s.pierceMul // 1º alvo: dano cheio; alvos perfurados: reduzido
          const dealt = s.dmg * crit * mul
          const sm = Math.hypot(s.vx, s.vy) || 1
          this.damageEnemy(e, dealt, 'base', s.vx / sm, s.vy / sm)
          // contato bem claro: faísca + anel de impacto
          this.fx.push({ type: 'spark', x: s.x, y: s.y, life: 0.2, max: 0.2, color: '#fff7e0' })
          this.fx.push({ type: 'death', x: s.x, y: s.y, r: 7, life: 0.24, max: 0.24, color: '#fff2cf' })
          // Número de dano acima do inimigo (mais alto p/ não conflitar com o selo de recompensa)
          const dmgTxt = dealt >= 1 ? String(Math.round(dealt)) : dealt.toFixed(1) // abaixo de 1 mostra 1 casa decimal (ex.: 0.2)
          this.fx.push({ type: 'dmg', x: e.x, y: e.y - e.r - 16, life: 0.7, max: 0.7, text: dmgTxt, color: crit > 1 ? '#ffd36b' : '#ffffff' })
          s.hit.push(e); s.hits++
          if (s.hits > s.pierce) { s.dead = true; break }
        }
      }
    }
    this.shots = this.shots.filter(s => !s.dead)

    // auras / status
    const bs = this.basicStats()
    const fs = this.has('forest') ? this.forestStats() : null
    const frs = this.has('frost') ? this.frostStats() : null
    if (bs.regen > 0 && run.hp < this.getMaxHP()) run.hp = Math.min(this.getMaxHP(), run.hp + bs.regen * dt)
    for (const e of this.enemies) {
      e.slowF = 1
      if (e.freeze > 0) { e.freeze -= dt; e.slowF = 0 }
      else if (frs) { const d = Math.hypot(e.x - this.cx, e.y - this.cy); if (d < frs.slowR + e.r) e.slowF = Math.min(e.slowF, 1 - frs.slow) }
      if (bs.auraDmg > 0) { const d = Math.hypot(e.x - this.cx, e.y - this.cy); if (d < bs.auraR + e.r) this.damageEnemy(e, bs.auraDmg * dt, 'base') }
      if (fs) { const d = Math.hypot(e.x - this.cx, e.y - this.cy); if (d < fs.auraR + e.r) this.damageEnemy(e, fs.auraDmg * dt, 'forest') }
      if (e.burn) { e.burn.dur -= dt; this.damageEnemy(e, e.burn.dps * dt, 'volcano'); if (e.burn.dur <= 0) e.burn = null }
    }
    for (const z of this.zones) { for (const e of this.enemies) { if (Math.hypot(e.x - z.x, e.y - z.y) < z.r + e.r) this.damageEnemy(e, z.dps * dt, 'volcano') } }
    for (let i = this.zones.length - 1; i >= 0; i--) { this.zones[i].dur -= dt; if (this.zones[i].dur <= 0) this.zones.splice(i, 1) }

    // movement + contact
    const dr = this.dr()
    for (const e of this.enemies) {
      const dx = this.cx - e.x, dy = this.cy - e.y, d = Math.hypot(dx, dy) || 1, nx = dx / d, ny = dy / d
      e.x += nx * e.sp * run.speedMul * e.slowF * dt + e.vx * dt
      e.y += ny * e.sp * run.speedMul * e.slowF * dt + e.vy * dt
      const decay = Math.min(1, 5 * dt); e.vx -= e.vx * decay; e.vy -= e.vy * decay
      if (e.fade < 1) e.fade = Math.min(1, e.fade + dt * 2.2)
      if (e.flash > 0) e.flash -= dt
      if (d < e.r + this.coreR) this.shatterEnemy(e, dr)
    }
    this.enemies = this.enemies.filter(e => !e.dead)

    // shards — deal damage to core when near it, then fly away
    for (const s of this.shards) {
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt
      if (s.life <= 0) { s.dead = true; continue }
      if (!s.dmgDealt) {
        const sd = Math.hypot(s.x - this.cx, s.y - this.cy)
        if (sd < this.coreR + s.r + 8) {
          s.dmgDealt = true
          run.hp = Math.max(0, run.hp - s.dmg)
          audio.play('core_hit')
        }
      }
    }
    this.shards = this.shards.filter(s => !s.dead)

    if (run.hp <= 0) { this.endRun(false); return }
    if (!this._waveResolved && this.toSpawn.length === 0 && this.enemies.length === 0) {
      this._waveResolved = true
      const m = MAPS[run.mapIdx]
      // Bônus por superar a onda: ~5 abates ao valor da fase atual (escala com a dificuldade)
      const waveBonus = Math.round(5 * (1 + 0.5 * (m.diff - 1)) * (1 + this.lvl('b_luz')))
      this.coins += waveBonus
      audio.play('coin')
      // Recompensa de onda anima junto ao total de moedas no topo
      this.fx.push({ type: 'coin', x: this.cx, y: 92, sx: this.cx, sy: 92, life: 1.3, max: 1.3, text: `+${waveBonus} ✦` })
      // Ondas em sequência contínua — sem parar para comprar. Acabou uma, vem a próxima.
      if (run.wave >= m.waves) this.endRun(true)
      else {
        run.wave++; this.spawnWave()
        audio.play('wave_start')
        this.say(WAVE_LINES)
        this._waveNum = run.wave; this._waveNumMax = 2.8; this._waveNumT = 2.8 // número gigante atrás do pilar
        // Transição: clareia o fundo, pulsa a câmera (com impacto) e emana uma onda do personagem
        this._bgLiftTarget = Math.min(1, (run.wave - 1) / m.waves)
        this._camPulse = 1
        this._shake = Math.max(this._shake, 0.3)
        this.fx.push({ type: 'shock', x: this.cx, y: this.cy, r: Math.max(this.W, this.H) * 0.6, life: 0.85, max: 0.85, color: m.palette.accent })
      }
    }
  }

  // ---------- shatter on core contact ----------
  private shatterEnemy(e: Enemy, dr: number) {
    if (e.dead) return
    e.dead = true
    if (!this.run) return
    const kills = this.run
    kills.kills++
    // Colisão com o núcleo NÃO dá moeda — só abates por arma rendem ✦
    this.fx.push({ type: 'death', x: e.x, y: e.y, r: e.r, life: 0.35, max: 0.35, color: e.rim })
    if (e.boss) this._shake = 0.5
    this._coreFlash = 0.22

    const shardCount = e.boss ? 14 : (e.type === 'tank' ? 9 : 6)
    const totalDmg = e.dps * 1.2 * (1 - dr)
    const dmgPerShard = totalDmg / shardCount
    for (let i = 0; i < shardCount; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 60 + Math.random() * 140
      this.shards.push({
        x: e.x, y: e.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: e.r * (0.15 + Math.random() * 0.22),
        dmg: dmgPerShard,
        life: 0.45 + Math.random() * 0.35,
        max: 0.8,
        color: e.rim,
      })
    }
    kills.dmgByPath['base'] = (kills.dmgByPath['base'] || 0) + totalDmg
  }

  // ---------- weapons ----------
  private wpBasic(dt: number) {
    if (!this.run) return
    // Em cooldown: consome. Pronto (<=0) sem alvo: fica preenchido e estático (não recicla).
    if (this.run.tBasic > 0) { this.run.tBasic -= dt; return }
    const s = this.basicStats()
    // dano já a caminho de cada inimigo (evita overkill: não mira quem um projétil em voo já eliminará)
    const incoming = new Map<Enemy, number>()
    for (const sh of this.shots) { if (sh.target && !sh.target.dead) incoming.set(sh.target, (incoming.get(sh.target) || 0) + sh.dmg) }
    let best: Enemy | null = null, bd = 1e9
    // Ataca assim que a BORDA do inimigo toca a linha do círculo de alcance (d - raio < range)
    for (const e of this.enemies) {
      if (e.dead) continue
      if (e.hp - (incoming.get(e) || 0) <= 0) continue // já será eliminado por projétil em voo
      const d = Math.hypot(e.x - this.cx, e.y - this.cy)
      if (d < bd && d - e.r < s.range) { bd = d; best = e }
    }
    if (!best) return
    this.run.tBasic = s.interval // cooldown só inicia quando realmente dispara
    audio.play('shoot_basic')
    const base = Math.atan2(best.y - this.cy, best.x - this.cx)
    const spd = s.projSpeed, life = s.range / spd + 0.4
    // clarão de disparo (muzzle flash) na boca do núcleo
    this.fx.push({ type: 'spark', x: this.cx + Math.cos(base) * this.coreR, y: this.cy + Math.sin(base) * this.coreR, life: 0.16, max: 0.16, color: '#fff7e0' })
    for (let i = 0; i < s.count; i++) { const a = base + (i - (s.count - 1) / 2) * 0.13; this.shots.push({ x: this.cx, y: this.cy, px: this.cx, py: this.cy, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, dmg: s.dmg, crit: s.crit, life, pierce: s.pierce, pierceMul: s.pierceMul, hits: 0, hit: [], target: best }) }
  }
  private wpStorm(dt: number) {
    if (!this.run) return
    this.run.tStorm -= dt; if (this.run.tStorm > 0) return
    const s = this.stormStats(); this.run.tStorm = s.interval
    const pool = this.enemies.filter(e => !e.dead && Math.hypot(e.x - this.cx, e.y - this.cy) < s.range)
    if (!pool.length) return
    audio.play('shoot_storm')
    let cur = { x: this.cx, y: this.cy }; const hit: Enemy[] = [], pts = [{ x: this.cx, y: this.cy }]
    for (let i = 0; i < s.chain; i++) {
      let best: Enemy | null = null, bd = 1e9
      for (const e of pool) { if (hit.indexOf(e) >= 0) continue; const d = Math.hypot(e.x - cur.x, e.y - cur.y); if (d < bd) { bd = d; best = e } }
      if (!best || bd > (i === 0 ? s.range : 130)) break
      const crit = Math.random() < s.crit ? 2 : 1
      this.damageEnemy(best, s.dmg * crit, 'storm'); if (crit > 1) best.freeze = Math.max(best.freeze, 0.15)
      hit.push(best); pts.push({ x: best.x, y: best.y }); cur = best
    }
    if (pts.length > 1) this.fx.push({ type: 'bolt', pts: this.jagged(pts), life: 0.16, max: 0.16, color: '#6aa8ff' })
  }
  private jagged(pts: { x: number; y: number }[]) { const out = [pts[0]]; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; out.push({ x: (a.x + b.x) / 2 + (Math.random() - 0.5) * 16, y: (a.y + b.y) / 2 + (Math.random() - 0.5) * 16 }); out.push(b) } return out }
  private wpVolcano(dt: number) {
    if (!this.run) return
    this.run.tVol -= dt; if (this.run.tVol > 0) return
    const s = this.volcanoStats(); this.run.tVol = s.interval
    const pool = this.enemies.filter(e => !e.dead); if (!pool.length) return
    audio.play('shoot_volcano')
    let t: Enemy | null = null, bd = 1e9
    for (const e of pool) { const d = Math.hypot(e.x - this.cx, e.y - this.cy); if (d < bd) { bd = d; t = e } }
    const px = t!.x, py = t!.y
    for (const e of pool) { if (Math.hypot(e.x - px, e.y - py) < s.radius + e.r) { this.damageEnemy(e, s.dmg, 'volcano'); e.burn = { dps: s.burn, dur: 2 } } }
    this.zones.push({ x: px, y: py, r: s.radius * 0.82, dps: s.burn, dur: s.zoneDur })
    this.fx.push({ type: 'boom', x: px, y: py, r: s.radius, life: 0.42, max: 0.42, color: '#ff8a4c' }); this._shake = Math.max(this._shake, 0.12)
  }
  private wpFrostNova(dt: number) {
    if (!this.run) return
    this.run.tFrost -= dt; if (this.run.tFrost > 0) return
    const s = this.frostStats(); this.run.tFrost = s.novaInt
    audio.play('shoot_frost')
    for (const e of this.enemies) { if (Math.hypot(e.x - this.cx, e.y - this.cy) < s.novaR + e.r) { this.damageEnemy(e, s.novaDmg, 'frost'); e.freeze = Math.max(e.freeze, s.freeze) } }
    this.fx.push({ type: 'nova', x: this.cx, y: this.cy, r: s.novaR, life: 0.5, max: 0.5, color: '#bfeaff' })
  }
  private wpTerra(dt: number) {
    if (!this.run) return
    this.run.tTerra -= dt; if (this.run.tTerra > 0) return
    const s = this.terraStats(); this.run.tTerra = s.interval
    audio.play('shoot_terra')
    for (const e of this.enemies) { const dx = e.x - this.cx, dy = e.y - this.cy, d = Math.hypot(dx, dy) || 1; if (d < s.waveR + e.r) { this.damageEnemy(e, s.dmg, 'terra'); e.vx += (dx / d) * s.knock; e.vy += (dy / d) * s.knock } }
    this.fx.push({ type: 'wave', x: this.cx, y: this.cy, r: s.waveR, life: 0.45, max: 0.45, color: '#d8b274' }); this._shake = Math.max(this._shake, 0.14)
  }
  private wpForestHeal(dt: number) {
    if (!this.run) return
    this.run.tForest -= dt; if (this.run.tForest > 0) return
    const s = this.forestStats(); this.run.tForest = s.healInt; const mx = this.getMaxHP()
    if (this.run.hp < mx) { this.run.hp = Math.min(mx, this.run.hp + s.heal); audio.play('heal'); this.fx.push({ type: 'heal', x: this.cx, y: this.cy, life: 0.7, max: 0.7 }) }
  }

  // ---------- end ----------
  private endRun(win: boolean) {
    if (!this.run) return
    const run = this.run, m = MAPS[run.mapIdx]
    let selo = false
    if (win) {
      this.unlocked = Math.max(this.unlocked, Math.min(MAPS.length, run.mapIdx + 2))
      if (!this.bossesBeaten[m.id]) { this.bossesBeaten[m.id] = true; this.tokens++; selo = true }
    }
    const forces = ['base', ...this.unlockedForces]
    const total = Object.values(run.dmgByPath).reduce((a, b) => a + b, 0) || 1
    const dmg = forces.map(p => ({ name: p === 'base' ? 'Luz' : PATHS[p as ForceKey].name, color: p === 'base' ? '#ffe6b0' : PATHS[p as ForceKey].color, pct: Math.round((run.dmgByPath[p] || 0) / total * 100) }))
    this.summary = { win, wave: win ? m.waves : run.wave, waves: m.waves, kills: run.kills, time: this.fmtTime(run.time), selo, dmg }
    // A run terminou: limpa o estado de partida (forças/selos são permanentes e ficam)
    this.run = null
    this.enemies = []; this.shots = []; this.shards = []; this.zones = []
    if (!win) this.deathLine = DEATH_LINES[Math.floor(Math.random() * DEATH_LINES.length)]
    audio.play(win ? 'victory' : 'defeat')
    this.setScreen(win ? 'victory' : 'defeat')
  }

  // ---------- actions (called from React) ----------
  goTitle = () => this.setScreen('title')
  goMap = () => { if (this.unlocked === 1) this.startRun(0); else this.setScreen('map') }
  goPoderes = () => this.setScreen('poderes')
  // Libera a Árvore da Luz gastando 1 ❖ (1ª compra do jogo). Guard idempotente + de saldo.
  unlockCore = () => { if (this.coreUnlocked) return; if (this.tokens <= 0) return; this.tokens--; this.coreUnlocked = true; this.touch() }
  pauseGame = () => this.setScreen('pause')
  resume = () => this.setScreen('game')
  abandon = () => { this.run = null; this.enemies = []; this.shots = []; this.setScreen('title') }
  selectMap = (i: number) => { if (i >= this.unlocked) return; this.startRun(i) }
  // Volta sempre ao mapa 1 (não zeramos o progresso permanente)
  playMap1 = () => this.startRun(0)
  retry = () => this.startRun(this._lastMap)
  nextPhase = () => this.startRun(Math.min(MAPS.length - 1, this._lastMap + 1))
  setSpeed = (n: number) => { this.speed = n; this.touch() }
  lastUpgraded = '' // id do último nó comprado (para posicionar câmera na loja)

  buyNode = (baseCost: number, id: string) => {
    // Upgrade PERMANENTE — gasta moeda permanente, sobe nível em perm{}
    const L = this.lvl(id); if (L >= MAX_LVL) return
    const c = this.nodeCost(baseCost, id); if (this.coins < c) return
    this.coins -= c; this.perm[id] = (this.perm[id] || 0) + 1
    this.lastUpgraded = id
    audio.play('upgrade')
    if (this.run) { if (id === 'b_hp') this.run.hp += 10; if (id === 'for_vigor') this.run.hp += 8 }
    this.touch()
  }
  buyForceNode = (k: ForceKey, baseCost: number, id: string) => {
    // Upgrade de força — gasta a moeda específica daquela força
    const L = this.lvl(id); if (L >= MAX_LVL) return
    const c = this.nodeCost(baseCost, id); if (this.forceCoins[k] < c) return
    this.forceCoins[k] -= c; this.perm[id] = (this.perm[id] || 0) + 1
    this.lastUpgraded = id
    audio.play('upgrade')
    this.touch()
  }
  unlockForce = (k: ForceKey) => {
    if (!this.coreUnlocked) return // forças só depois de liberar a Luz
    if (this.unlockedForces.length >= 2) return
    if (this.tokens <= 0) return
    if (this.has(k)) return
    this.tokens--; this.unlockedForces.push(k); this.touch()
  }

  // ---------- background particles ----------
  private initMotes() {
    this.maxMote = Math.min(this.W, this.H) * 0.5; this.motes = []
    for (let i = 0; i < 64; i++) { const a = Math.random() * Math.PI * 2, rr = Math.random() * this.maxMote * 0.7; this.motes.push({ x: this.cx + Math.cos(a) * rr, y: this.cy + Math.sin(a) * rr, vx: Math.random() - 0.5, vy: (Math.random() - 0.5) - 0.3, sz: Math.random() * 1.6 + 0.5, ph: Math.random() * 6 }) }
  }
  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
  }

  // Cópia do sprite tingida na cor (só nos pixels do personagem), em cache por cor.
  // Usada como overlay translúcido para ambientar o personagem à paleta do bioma.
  private getTintedHero(color: string): HTMLCanvasElement | null {
    if (!this.heroImg || !this.heroReady) return null
    if (this._heroTint && this._heroTintKey === color) return this._heroTint
    const iw = this.heroImg.naturalWidth, ih = this.heroImg.naturalHeight
    if (!iw || !ih) return null
    const c = document.createElement('canvas'); c.width = iw; c.height = ih
    const cc = c.getContext('2d'); if (!cc) return null
    cc.drawImage(this.heroImg, 0, 0)
    cc.globalCompositeOperation = 'source-atop' // pinta apenas onde há sprite
    cc.fillStyle = color
    cc.fillRect(0, 0, iw, ih)
    this._heroTint = c; this._heroTintKey = color
    return c
  }

  // ---------- render ----------
  private render() {
    const ctx = this.ctx; if (!ctx) return
    const W = this.W, H = this.H, cx = this.cx, cy = this.cy
    const glow = this.opts.glow !== false, parts = this.opts.particles !== false
    const m: MapDef = this.run ? MAPS[this.run.mapIdx] : MAPS[0]
    const pal = m.palette
    const prog = this.run ? Math.min(1, (this.run.wave - 1) / m.waves) : 0
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    // Background fills entire screen — outside world transform so it's never clipped
    // Fundo: gradiente de DUAS cores da paleta (centro→borda) que combinam com o pilar (pal.accent).
    // Escuro na onda 1, clareia a cada onda superada (_bgLift) — luz emanando do personagem.
    const lift = this._bgLift
    const dark = 1 - this._deathProg * 0.72 // na morte o fundo fica mais escuro que o inicial
    // Câmera compartilhada: usada pelo FUNDO (com parallax amortecido) e pelo transform do MUNDO.
    // zp = escala do mundo; sk/sx/sy = offset do shake (UM por frame, reusado p/ fundo e mundo → impacto coeso).
    const zp = this._zoom * (1 + this._camPulse * 0.14)
    const sk = this._shake > 0 ? this._shake * 7 : 0
    const sx = sk ? (Math.random() - 0.5) * sk : 0, sy = sk ? (Math.random() - 0.5) * sk : 0
    // Fundo segue a câmera com PARALLAX AMORTECIDO (fração do desvio-da-identidade do mundo), mesmo pivô (cx,cy):
    // zoom 40% + leve extra do "pulo", sway 42%, shake 35%. Tudo colapsa p/ identidade em repouso (cena estável).
    const bgZ = 1 + (zp - 1) * 0.40 + this._camPulse * 0.14 * 0.10
    const bgAng = this._camAngle * 0.42
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(bgZ * (1 + bgAng), bgZ)
    ctx.translate(-cx, -cy)
    if (sk) ctx.translate(sx * 0.35, sy * 0.35)
    if (this.bgReady && this.bgImg) {
      // Cenário (fase1) em tela cheia — object-fit: cover + 8% de over-scale (parallax nunca revela borda)
      const iw = this.bgImg.naturalWidth, ih = this.bgImg.naturalHeight
      const sc = Math.max(W / iw, H / ih) * 1.08, dw = iw * sc, dh = ih * sc
      ctx.drawImage(this.bgImg, (W - dw) / 2, (H - dh) / 2, dw, dh)
    } else {
      // Fallback (sem a imagem): gradiente procedural — também respira com a câmera; rect ampliado cobre a escala
      const cInner = this.mix(pal.void, pal.accent, 0.1 + lift * 0.5, dark)
      const cOuter = this.mix(pal.void, pal.glow, 0.02 + lift * 0.2, dark)
      const bgGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(W, H) * 0.95)
      bgGrad.addColorStop(0, cInner); bgGrad.addColorStop(1, cOuter)
      ctx.fillStyle = bgGrad; ctx.fillRect(-W, -H, W * 3, H * 3)
    }
    ctx.restore()
    // Iluminação dinâmica (tela cheia, FORA do parallax): escurece na morte, clareia a cada onda superada
    if (this.bgReady && this.bgImg) {
      // Onda 1 quase no escuro (void da fase); a cada onda vencida (lift) a luz da fase toma conta.
      const tintA = Math.max(0, (this.run ? 0.66 : 0.28) - lift * 0.68 + this._deathProg * 0.4)
      if (tintA > 0.001) { ctx.fillStyle = this.withA(pal.void, tintA); ctx.fillRect(-20, -20, W + 40, H + 40) }
    }
    // flutuação do personagem (sobe/desce, como se estivesse vivo) — usada no sprite e no balão
    this._heroBob = this.heroReady ? Math.sin(this.t * 1.1) * 6 * (1 - this._deathProg * 0.5) : 0
    // Transform do mundo: zoom + pulsar de transição + giro horizontal (scaleX) + shake (mesmo offset do fundo)
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(zp * (1 + this._camAngle), zp)
    ctx.translate(-cx, -cy)
    if (sk) ctx.translate(sx, sy)
    // Banho de luz da fase, irradiando do centro — começa quase nulo (onda 1 escura) e cresce/clareia
    // forte a cada onda vencida (lift): a luz "vence o vazio" e toma conta da tela no tom da fase.
    const aliveR = Math.max(W, H) * (0.26 + lift * 0.62)
    let g = ctx.createRadialGradient(cx, cy, 8, cx, cy, aliveR)
    g.addColorStop(0, this.withA(pal.glow, 0.1 + lift * 0.72)); g.addColorStop(0.5, this.withA(pal.glow, 0.04 + lift * 0.26)); g.addColorStop(1, this.withA(pal.glow, 0))
    ctx.fillStyle = g; ctx.fillRect(-20, -20, W + 40, H + 40)
    if (parts) { for (const mo of this.motes) { const d = Math.hypot(mo.x - cx, mo.y - cy); const fade = Math.max(0, 1 - d / this.maxMote); const tw = 0.5 + 0.5 * Math.sin(this.t * 2 + mo.ph); ctx.globalAlpha = fade * tw * (0.35 + prog * 0.55); ctx.fillStyle = pal.accent; ctx.beginPath(); ctx.arc(mo.x, mo.y, mo.sz, 0, 7); ctx.fill() } ctx.globalAlpha = 1 }
    for (const z of this.zones) { const a = Math.min(1, z.dur) * 0.4; const zg = ctx.createRadialGradient(z.x, z.y, 2, z.x, z.y, z.r); zg.addColorStop(0, `rgba(255,140,60,${a})`); zg.addColorStop(1, 'rgba(255,90,30,0)'); ctx.fillStyle = zg; ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, 7); ctx.fill() }
    if (this.run && this.screen !== 'title') {
      const bs = this.basicStats()
      // Círculo de alcance do ataque — limitação visível do raio de tiro do núcleo
      const rr = bs.range, rg = ctx.createRadialGradient(cx, cy, rr * 0.7, cx, cy, rr)
      rg.addColorStop(0, this.withA('#ffe6b0', 0)); rg.addColorStop(1, this.withA('#ffe6b0', 0.05))
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 7); ctx.fill()
      ctx.strokeStyle = this.withA('#ffe6b0', 0.22 + 0.06 * Math.sin(this.t * 1.6)); ctx.lineWidth = 1.5
      ctx.setLineDash([5, 7]); ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 7); ctx.stroke(); ctx.setLineDash([])
      if (bs.auraDmg > 0) { ctx.strokeStyle = this.withA('#ffe6b0', 0.14 + 0.05 * Math.sin(this.t * 2)); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, bs.auraR, 0, 7); ctx.stroke() }
      if (this.has('forest')) { const s = this.forestStats(); ctx.strokeStyle = this.withA('#74e3a0', 0.18 + 0.06 * Math.sin(this.t * 2)); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, s.auraR, 0, 7); ctx.stroke() }
      if (this.has('frost')) { const s = this.frostStats(); ctx.strokeStyle = this.withA('#bfeaff', 0.12); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, s.slowR, 0, 7); ctx.stroke() }
    }
    // enemies
    for (const e of this.enemies) {
      ctx.save(); ctx.translate(e.x, e.y)
      if (e.fade < 1) ctx.globalAlpha = e.fade
      const frozen = e.freeze > 0
      const baseFill = e.force ? this.mix(e.rim, '#10151f', 0.66) : '#10151f' // tinge na cor da força
      ctx.fillStyle = e.flash > 0 ? '#ffffff' : (frozen ? '#9fd4ff' : baseFill)
      ctx.strokeStyle = this.withA(e.rim, frozen ? 0.9 : (e.force ? 0.95 : 0.75)); ctx.lineWidth = e.boss ? 3 : (e.force ? 2.5 : 2)
      const sides = e.boss ? 6 : (e.type === 'fast' ? 3 : (e.type === 'tank' ? 5 : 4))
      ctx.beginPath()
      for (let i = 0; i < sides; i++) { const a = this.t * (e.type === 'fast' ? 1.6 : 0.4) * (e.boss ? 0.3 : 1) + i / sides * Math.PI * 2; const rr = e.r * (i % 2 && !e.boss ? 0.82 : 1); const px = Math.cos(a) * rr, py = Math.sin(a) * rr; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py) }
      ctx.closePath(); ctx.fill(); ctx.stroke()
      if ((e.boss || e.type === 'tank') && e.hp < e.maxhp) { ctx.strokeStyle = this.withA(e.rim, 0.9); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, e.r + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (e.hp / e.maxhp)); ctx.stroke() }
      ctx.restore()
    }
    // shots
    for (const s of this.shots) {
      // rastro do projétil
      ctx.strokeStyle = this.withA('#ffe6b0', 0.55); ctx.lineWidth = 3; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(s.px, s.py); ctx.lineTo(s.x, s.y); ctx.stroke(); ctx.lineCap = 'butt'
      // cabeça luminosa
      ctx.save(); if (glow) { ctx.shadowColor = '#ffe6b0'; ctx.shadowBlur = 9 }
      ctx.fillStyle = '#fff7e0'; ctx.beginPath(); ctx.arc(s.x, s.y, 3.4, 0, 7); ctx.fill(); ctx.restore()
    }
    // fx
    for (const f of this.fx) {
      const a = Math.max(0, f.life / f.max)
      if (f.type === 'bolt' && f.pts) { ctx.save(); if (glow) { ctx.shadowColor = f.color!; ctx.shadowBlur = 10 } ctx.strokeStyle = this.withA(f.color!, a); ctx.lineWidth = 2.4; ctx.beginPath(); f.pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke(); ctx.strokeStyle = this.withA('#ffffff', a * 0.8); ctx.lineWidth = 1; ctx.stroke(); ctx.restore() }
      else if (f.type === 'boom') { const rad = f.r! * (0.4 + (1 - a) * 0.6); const bg = ctx.createRadialGradient(f.x!, f.y!, 2, f.x!, f.y!, rad); bg.addColorStop(0, this.withA('#ffd9a0', a * 0.7)); bg.addColorStop(0.6, this.withA(f.color!, a * 0.5)); bg.addColorStop(1, this.withA(f.color!, 0)); ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(f.x!, f.y!, rad, 0, 7); ctx.fill() }
      else if (f.type === 'nova') { const rad = f.r! * (1 - a * 0.85); ctx.strokeStyle = this.withA(f.color!, a * 0.8); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(f.x!, f.y!, rad, 0, 7); ctx.stroke() }
      else if (f.type === 'wave') { const rad = f.r! * (0.5 + (1 - a) * 0.5); ctx.strokeStyle = this.withA(f.color!, a * 0.7); ctx.lineWidth = 5 * a + 1; ctx.beginPath(); ctx.arc(f.x!, f.y!, rad, 0, 7); ctx.stroke() }
      else if (f.type === 'shock') { const age = 1 - a; ctx.save(); if (glow) { ctx.shadowColor = f.color!; ctx.shadowBlur = 12 } ctx.strokeStyle = this.withA(f.color!, a * 0.85); ctx.lineWidth = 4 * a + 1.5; ctx.beginPath(); ctx.arc(f.x!, f.y!, f.r! * age, 0, 7); ctx.stroke(); ctx.strokeStyle = this.withA('#ffffff', a * 0.55); ctx.lineWidth = 2.5 * a + 0.5; ctx.beginPath(); ctx.arc(f.x!, f.y!, f.r! * age * 0.6, 0, 7); ctx.stroke(); ctx.restore() }
      else if (f.type === 'death') { const rad = f.r! * (1 + (1 - a) * 1.6); ctx.strokeStyle = this.withA(f.color!, a * 0.7); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(f.x!, f.y!, rad, 0, 7); ctx.stroke() }
      else if (f.type === 'spark') { ctx.fillStyle = this.withA(f.color!, a); ctx.beginPath(); ctx.arc(f.x!, f.y!, 3 * (0.5 + a), 0, 7); ctx.fill() }
      else if (f.type === 'heal') { ctx.fillStyle = this.withA('#9bf0b8', a); ctx.font = "600 16px 'Space Grotesk',sans-serif"; ctx.textAlign = 'center'; ctx.fillText('+', f.x! + 18, f.y! - 30 - (1 - a) * 22) }
      else if (f.type === 'coin') {
        const age = 1 - a // 0→1
        const sx = f.sx ?? f.x!, sy = f.sy ?? f.y!
        const tx = W / 2, ty = 64 // contador de moedas no topo
        // ease-in: começa lento e ganha velocidade em direção ao contador
        const e2 = age * age * age
        // bézier CÚBICA: P0 = morte; P1 = empurrão na direção do hit fatal; P2 = arco alto; P3 = contador
        const p1x = sx + (f.dx ?? 0) * 34, p1y = sy + (f.dy ?? 0) * 34
        const p2x = tx, p2y = ty + 90
        const u = 1 - e2
        const bx = u * u * u * sx + 3 * u * u * e2 * p1x + 3 * u * e2 * e2 * p2x + e2 * e2 * e2 * tx
        const by = u * u * u * sy + 3 * u * u * e2 * p1y + 3 * u * e2 * e2 * p2y + e2 * e2 * e2 * ty
        // fade-in suave (transparente → 100%) e fade-out ao entrar no contador
        const fadeIn = Math.min(1, age / 0.2), fadeOut = Math.min(1, a / 0.12)
        const alpha = Math.min(fadeIn, fadeOut)
        const scale = (0.7 + 0.3 * fadeIn) * (1 - e2 * 0.4)
        ctx.save(); ctx.globalAlpha = alpha
        ctx.translate(bx, by); ctx.scale(scale, scale)
        ctx.font = "700 11px 'Space Grotesk',sans-serif"; ctx.textBaseline = 'middle'; ctx.textAlign = 'center'
        const txt = f.text || '', tw = ctx.measureText(txt).width, h = 16, rw = tw + 9
        this.roundRect(ctx, -rw / 2, -h / 2, rw, h, h / 2); ctx.fillStyle = f.color || '#ffe6b0'; ctx.fill()
        ctx.lineWidth = 1.5; ctx.strokeStyle = f.color ? 'rgba(255,255,255,0.5)' : '#ffd24a'; ctx.stroke()
        ctx.fillStyle = '#14130c'; ctx.fillText(txt, 0, 1)
        ctx.restore()
      }
      else if (f.type === 'dmg') { const crit = f.color === '#ffd36b'; ctx.save(); ctx.globalAlpha = a; ctx.font = `700 ${crit ? 17 : 13}px 'Space Grotesk',sans-serif`; ctx.textAlign = 'center'; const ty = f.y! - (1 - a) * 24; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeText(f.text || '', f.x!, ty); ctx.fillStyle = f.color || '#ffffff'; ctx.fillText(f.text || '', f.x!, ty); ctx.restore() }
    }
    // shards (crystal fragments from shattered enemies)
    for (const s of this.shards) {
      const sa = Math.max(0, s.life / s.max)
      ctx.save()
      ctx.globalAlpha = sa * 0.9
      ctx.translate(s.x, s.y)
      ctx.rotate(Math.atan2(s.vy, s.vx))
      ctx.fillStyle = s.color
      ctx.beginPath()
      ctx.moveTo(s.r * 1.6, 0)
      ctx.lineTo(-s.r * 0.8, s.r * 0.7)
      ctx.lineTo(-s.r * 0.8, -s.r * 0.7)
      ctx.closePath()
      ctx.fill()
      if (glow) { ctx.shadowColor = s.color; ctx.shadowBlur = 6; ctx.fill() }
      ctx.restore()
    }
    // Número gigante da onda — atrás do pilar, gradiente claro no topo → transparente embaixo
    if (this._waveNumT > 0 && this._waveNum > 0) {
      const age = this._waveNumMax - this._waveNumT
      const wa = Math.min(1, this._waveNumT / 0.6) * Math.min(1, age / 0.9) // começa 100% transparente, fade lento e sutil
      // entrada lenta, ease-in-out, com deslocamento bem curto (não vem do topo)
      const ep = Math.min(1, age / 1.4)
      const eased = ep * ep * ep * (ep * (ep * 6 - 15) + 10) // smootherstep
      const fs = H * 0.35, nyFinal = cy - H * 0.1
      const ny = nyFinal - (1 - eased) * 24 // movimento curto, assenta atrás do personagem
      const numTop = ny - fs * 0.42, numBot = ny + fs * 0.42
      const ng = ctx.createLinearGradient(0, numTop, 0, numBot)
      ng.addColorStop(0, `rgba(245,248,255,${0.5 * wa})`)
      ng.addColorStop(0.32, this.withA(pal.accent, 0.26 * wa))
      ng.addColorStop(0.62, this.withA(pal.accent, 0.07 * wa)) // some bem mais rápido da metade pro fim
      ng.addColorStop(1, this.withA(pal.accent, 0))
      ctx.save(); ctx.font = `800 ${fs}px 'Space Grotesk',sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillStyle = ng; ctx.fillText(String(this._waveNum), cx, ny); ctx.restore()
    }
    // personagem principal — sprite (hero.png) substituindo núcleo + pilar
    const dp0 = this._deathProg
    const pulse = 1 + Math.sin(this.t * 1.6) * 0.04; const acc = this.beingColor()
    const dp = this._deathProg, ds = 1 - dp * 0.6, bp = pulse * ds // luz esvai: encolhe e enfraquece
    const bob = this._heroBob, hcy = cy + bob // centro vertical do orbe, flutuando
    if (this.heroReady && this.heroImg) {
      // Pilar de luz com gradiente ao centro — o núcleo/personagem flutua ACIMA dele.
      // Topo fixo em cy+24 (não acompanha a flutuação): o orbe sobe/desce em cy±6, então a fresta
      // entre orbe e pilar oscila a cada respiro — o sinal mais forte de "flutuando acima".
      // O pilar NÃO encolhe na morte (sem dp0): só o personagem se esvai; o pilar permanece intacto.
      const pTop = cy + 24, pBot = cy + H * 0.42, pw = 24
      const pg = ctx.createLinearGradient(0, pTop, 0, pBot)
      pg.addColorStop(0, this.run ? this.withA(pal.accent, 0.4 + lift * 0.4) : 'rgba(200,210,225,0.38)')
      pg.addColorStop(0.45, this.run ? this.withA(pal.accent, 0.14 + lift * 0.18) : 'rgba(200,210,225,0.11)')
      pg.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = pg; this.roundRect(ctx, cx - pw / 2, pTop, pw, pBot - pTop, pw / 2); ctx.fill()
      // brilho de contato no topo do pilar (elipse achatada) — a luz do orbe "pousa" sem tocar
      if (glow) {
        const ag = ctx.createRadialGradient(cx, pTop, 1, cx, pTop, pw * 0.9)
        ag.addColorStop(0, this.withA(pal.glow, 0.14 + lift * 0.28)); ag.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.save(); ctx.translate(cx, pTop); ctx.scale(1, 0.32); ctx.fillStyle = ag
        ctx.beginPath(); ctx.arc(0, 0, pw * 0.9, 0, 7); ctx.fill(); ctx.restore()
      }
      const iw = this.heroImg.naturalWidth, ih = this.heroImg.naturalHeight
      const HERO_SCALE = 0.15 // tamanho do personagem (15% do original)
      const drawW = 178 * HERO_SCALE * bp, drawH = drawW * (ih / iw)
      const orbY = 0.27 // posição vertical do orbe luminoso dentro da arte (~27% do topo)
      const ax = cx - drawW / 2, ay = hcy - drawH * orbY
      // efeito de luz atrás do personagem (halo radial pulsante)
      if (glow) {
        // Halo/aura — a "luz" que o personagem emana, no TOM DA FASE; cresce a cada onda vencida (lift).
        const auraCol = this.unlockedForces.length ? PATHS[this.unlockedForces[0]].color : pal.accent
        const haloR = (46 + lift * 30) * bp
        const hg = ctx.createRadialGradient(cx, hcy, 2, cx, hcy, haloR)
        hg.addColorStop(0, this.withA(auraCol, (0.4 + lift * 0.5) * (1 - dp * 0.5)))
        hg.addColorStop(0.5, this.withA(pal.glow, (0.14 + lift * 0.2) * (1 - dp * 0.4)))
        hg.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(cx, hcy, haloR, 0, 7); ctx.fill()
      }
      // sprite com brilho (shadow), enfraquece ao morrer
      ctx.save(); ctx.globalAlpha = 1 - dp * 0.6
      if (glow) { ctx.shadowColor = acc; ctx.shadowBlur = (9 + lift * 13) * (1 - dp * 0.6) }
      ctx.drawImage(this.heroImg, ax, ay, drawW, drawH)
      ctx.restore()
      // ambientação: tinge o sprite com a cor do bioma (soft-light) p/ integrar à cena
      const tinted = this.getTintedHero(pal.accent)
      if (tinted) { ctx.save(); ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = (0.35 + lift * 0.3) * (1 - dp * 0.5); ctx.drawImage(tinted, ax, ay, drawW, drawH); ctx.restore() }
      // brilho interno aditivo no orbe (sensação de vivo)
      if (glow) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const ogR = (15 + lift * 10) * bp; const og = ctx.createRadialGradient(cx, hcy, 1, cx, hcy, ogR); og.addColorStop(0, this.withA('#fff7e0', (0.55 + lift * 0.22) * (1 - dp * 0.6))); og.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = og; ctx.beginPath(); ctx.arc(cx, hcy, ogR, 0, 7); ctx.fill(); ctx.restore() }
    } else {
      // Fallback procedural (enquanto hero.png não existe): pilar + ser de luz
      const pTop = cy + 16, pBot = cy + H * 0.42 * (1 - dp0 * 0.82), pw = 34 * (1 - dp0 * 0.45)
      const pg = ctx.createLinearGradient(0, pTop, 0, pBot)
      pg.addColorStop(0, this.run ? this.withA(pal.accent, 0.6) : 'rgba(200,210,225,0.4)'); pg.addColorStop(0.45, this.run ? this.withA(pal.accent, 0.22) : 'rgba(200,210,225,0.12)'); pg.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = pg; this.roundRect(ctx, cx - pw / 2, pTop, pw, pBot - pTop, pw / 2); ctx.fill()
      ctx.save(); ctx.globalAlpha = 1 - dp * 0.62
      if (glow) { const hg = ctx.createRadialGradient(cx, cy, 2, cx, cy, 68 * bp); hg.addColorStop(0, this.withA(this.unlockedForces.length ? PATHS[this.unlockedForces[0]].color : '#ffe6b0', 0.42 * (1 - dp * 0.5))); hg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(cx, cy, 68 * bp, 0, 7); ctx.fill() }
      ctx.save(); if (glow) { ctx.shadowColor = acc; ctx.shadowBlur = 22 * (1 - dp * 0.6) } ctx.fillStyle = '#f3f8ff'; this.roundRect(ctx, cx - 12 * bp, cy - 26 * bp, 24 * bp, 52 * bp, 12 * bp); ctx.fill(); ctx.restore()
      ctx.fillStyle = '#ffffff'; this.roundRect(ctx, cx - 5 * ds, cy - 16 * ds, 10 * ds, 32 * ds, 5 * ds); ctx.fill()
      ctx.restore()
    }
    if (this._coreFlash > 0) { ctx.strokeStyle = this.withA('#ff6b6b', this._coreFlash * 4); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, hcy, 34, 0, 7); ctx.stroke() }
    // Restore to screen space — vignette, danger overlay, HUD are not zoomed/rotated
    ctx.restore()
    // vignette
    const vg = ctx.createRadialGradient(cx, cy, Math.min(W, H) * 0.35, cx, cy, Math.max(W, H) * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)'); ctx.fillStyle = vg; ctx.fillRect(-20, -20, W + 40, H + 40)
    if (this.run && this.screen === 'game' && this.run.hp / this.getMaxHP() < 0.3) { ctx.fillStyle = this.withA('#ff4d4d', 0.06 + 0.05 * Math.sin(this.t * 6)); ctx.fillRect(0, 0, W, H) }
    // Vitória: a luminosidade toma o bioma (clareia tudo até a luz plena)
    if (this._winProg > 0.001) { ctx.fillStyle = `rgba(246,244,237,${this._winProg * 0.92})`; ctx.fillRect(-20, -20, W + 40, H + 40) }
    if (this.screen === 'game' && this.run) this.drawHUD(ctx, W)
    // Balão de fala do ser de luz
    if (this.screen === 'game' && this._speechT > 0 && this._speech) {
      const alpha = Math.min(1, this._speechT / 0.4) * Math.min(1, (this._speechMax - this._speechT) / 0.12)
      const age = this._speechMax - this._speechT
      const pop = age < 0.16 ? 0.6 + 0.4 * (age / 0.16) : 1
      ctx.save(); ctx.globalAlpha = alpha
      ctx.font = "600 11px 'Space Grotesk',sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      const txt = this._speech, tw = ctx.measureText(txt).width, bh = 22, rw = tw + 22
      // acompanha o personagem (inclui a flutuação); acima do halo quando é sprite
      const sy = this.heroReady ? cy + this._heroBob - 96 : cy - this.coreR - 34
      ctx.translate(cx, sy); ctx.scale(pop, pop)
      this.roundRect(ctx, -rw / 2, -bh / 2, rw, bh, 8); ctx.fillStyle = '#eef3f8'; ctx.fill()
      ctx.beginPath(); ctx.moveTo(-5, bh / 2 - 1); ctx.lineTo(5, bh / 2 - 1); ctx.lineTo(0, bh / 2 + 6); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#15181d'; ctx.fillText(txt, 0, 1); ctx.restore()
    }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
  }

  private drawHUD(ctx: CanvasRenderingContext2D, W: number) {
    const run = this.run!; const mx = this.getMaxHP(), ratio = Math.max(0, run.hp / mx)
    const bx = W * 0.16, by = 20, bw = W * 0.68, bh = 8
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; this.roundRect(ctx, bx, by, bw, bh, 4); ctx.fill()
    const col = ratio < 0.3 ? '#ff6b6b' : (ratio < 0.6 ? '#ffce6b' : '#ffe6b0')
    ctx.fillStyle = col; this.roundRect(ctx, bx, by, Math.max(3, bw * ratio), bh, 4); ctx.fill()
    ctx.fillStyle = '#aeb7c6'; ctx.font = "500 10px 'Space Grotesk',sans-serif"; ctx.textAlign = 'center'
    ctx.fillText('INTEGRIDADE  ' + Math.ceil(run.hp) + ' / ' + mx, W / 2, by + 22)
    // (chips de força antigos removidos — identidade/cor agora vêm na linha de moedas ◈ abaixo)
    ctx.textAlign = 'left'; ctx.fillStyle = '#cfd6e2'; ctx.font = "600 13px 'Space Grotesk',sans-serif"
    ctx.fillText('ONDA ' + run.wave + ' / ' + MAPS[run.mapIdx].waves, 18, 58)
    // ---- LINHA DE MOEDAS (revelação progressiva por fase) ----
    // Fase 1: só ✦. Fase 2+: + uma ◈ por força liberada (na cor da força). Fase 3+: + ❖ (selo).
    type Pill = { kind: 'luz' | 'force' | 'selo'; val: number; color: string }
    const items: Pill[] = [{ kind: 'luz', val: this.coins, color: '#ffe6b0' }]
    if (run.mapIdx >= 1) for (const k of this.unlockedForces) items.push({ kind: 'force', val: this.forceCoins[k], color: PATHS[k].color })
    if (run.mapIdx >= 2) items.push({ kind: 'selo', val: this.tokens, color: '#cdb8ff' })
    const cyR = 64, gap = 16
    const widths = items.map(it => {
      if (it.kind === 'luz') { ctx.font = "700 22px 'Space Grotesk',sans-serif"; return ctx.measureText(it.val + ' ✦').width }
      ctx.font = "600 13px 'Space Grotesk',sans-serif"; return ctx.measureText((it.kind === 'force' ? '◈' : '❖') + ' ' + it.val).width
    })
    const totalW = widths.reduce((a, b) => a + b, 0) + gap * (items.length - 1)
    let rx = W / 2 - totalW / 2
    for (let i = 0; i < items.length; i++) {
      const it = items[i], w = widths[i], midX = rx + w / 2
      if (it.kind === 'luz') {
        const pulse = 1 + 0.04 * Math.sin(this.t * 4) + this._coinPulse * 0.32
        ctx.save(); ctx.translate(midX, cyR); ctx.scale(pulse, pulse)
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.shadowColor = `rgba(255,210,74,${0.6 + this._coinPulse * 0.4})`; ctx.shadowBlur = 14 + this._coinPulse * 16
        ctx.fillStyle = '#ffe6b0'; ctx.font = "700 22px 'Space Grotesk',sans-serif"
        ctx.fillText(this.coins + ' ✦', 0, 0); ctx.restore()
        if (this._coinPulse > 0.02) { ctx.save(); ctx.strokeStyle = this.withA('#ffe6b0', this._coinPulse * 0.7); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(midX, cyR, 22 + (1 - this._coinPulse) * 16, 0, 7); ctx.stroke(); ctx.restore() }
      } else {
        ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.shadowColor = this.withA(it.color, 0.45); ctx.shadowBlur = 6
        ctx.fillStyle = it.color; ctx.font = "600 13px 'Space Grotesk',sans-serif"
        ctx.fillText((it.kind === 'force' ? '◈' : '❖') + ' ' + it.val, midX, cyR + 1); ctx.restore()
      }
      rx += w + gap
    }
    // ---- fim da linha de moedas ----
    this.drawPowerIndicator(ctx, W)
  }

  private forceCooldown(k: ForceKey): number {
    const run = this.run!
    let frac = 0
    if (k === 'storm') frac = run.tStorm / this.stormStats().interval
    else if (k === 'volcano') frac = run.tVol / this.volcanoStats().interval
    else if (k === 'frost') frac = run.tFrost / this.frostStats().novaInt
    else if (k === 'terra') frac = run.tTerra / this.terraStats().interval
    else if (k === 'forest') frac = run.tForest / this.forestStats().healInt
    return Math.max(0, Math.min(1, 1 - frac))
  }

  // Indicador minimalista: luz maior ao centro + 2 slots de força (preenchidos ou bloqueados por selo)
  private drawPowerIndicator(ctx: CanvasRenderingContext2D, W: number) {
    const run = this.run!, iy = this.H - 56, cx = W / 2
    // centro: luz (maior)
    const lp = Math.max(0, Math.min(1, 1 - run.tBasic / this.basicStats().interval))
    this.drawSlot(ctx, cx, iy, 24, this.beingColor(), lp, 'light')
    // laterais: até 2 forças
    const sides = [{ x: cx - 58, key: this.unlockedForces[0] }, { x: cx + 58, key: this.unlockedForces[1] }]
    for (const s of sides) {
      if (s.key) this.drawSlot(ctx, s.x, iy, 15, PATHS[s.key].color, this.forceCooldown(s.key), 'force')
      else this.drawSlot(ctx, s.x, iy, 15, '#9a86c0', 0, 'locked')
    }
  }

  private drawSlot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, prog: number, kind: 'light' | 'force' | 'locked') {
    ctx.save()
    ctx.lineWidth = kind === 'light' ? 2 : 1.5
    if (kind === 'locked') {
      // slot vazio: anel tracejado fino + "1 ❖" indicando que precisa de um selo
      ctx.setLineDash([3, 4]); ctx.strokeStyle = this.withA(color, 0.4); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); ctx.setLineDash([])
      ctx.fillStyle = this.withA(color, 0.85); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = "700 11px 'Space Grotesk',sans-serif"
      ctx.fillText('1 ❖', x, y + 0.5)
      ctx.restore(); return
    }
    // trilho do cooldown
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke()
    // arco de progresso (linha fina)
    ctx.strokeStyle = this.withA(color, 0.9); ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); ctx.stroke(); ctx.lineCap = 'butt'
    if (kind === 'light') {
      const flash = prog >= 0.999 ? 1 : 0.9
      ctx.fillStyle = this.withA('#f3f8ff', flash); this.roundRect(ctx, x - 4, y - 9, 8, 18, 4); ctx.fill()
    } else {
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill()
    }
    ctx.restore()
  }
}
