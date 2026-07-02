import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import { Engine, MAX_LVL, type EngineOpts } from '../game/engine'
import { BASE, PATHS, MAPS, ORDER, VARIANTS, type ForceKey } from '../game/data'
import { UpIcon } from './icons'
import { withA } from './color'
import { audio } from '../game/audio'
import { showRewardedAd } from '../game/ads'

const F = "'Space Grotesk',sans-serif"

const OPTS: EngineOpts = { difficulty: 'Equilibrado', particles: true, glow: true }

// --- Portão de acesso (cortina client-side) ---
// ACCESS_OPEN: trava-mestra controlada AQUI no código. true = jogo abre SEM senha; false = exige o código.
const ACCESS_OPEN = false
// SHA-256 (hex) do código de acesso (6 dígitos). VAZIO = portão desligado. (texto puro nunca fica no fonte)
const ACCESS_HASH = '8dc32c96aa1700abc885cb31fa544c186ae132023739d3aa0cdae116448ed6cf'
async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function App() {
  const [, force] = useReducer((n: number) => n + 1, 0)
  const engineRef = useRef<Engine | null>(null)
  if (!engineRef.current) engineRef.current = new Engine(OPTS, force)
  const e = engineRef.current

  useEffect(() => { e.mount(); return () => e.unmount() }, [e])

  const s = e.screen
  // Portão de acesso: se há um código configurado (ACCESS_HASH), exige desbloqueio (lembrado por aparelho).
  const [access, setAccess] = useState(() => {
    if (ACCESS_OPEN || !ACCESS_HASH) return true // override no código, ou sem código → aberto
    try { return localStorage.getItem('lumen_access') === '1' } catch { return false }
  })

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', minHeight: '100dvh', background: '#000', fontFamily: F }}>
      <div style={{ position: 'relative', width: 'min(100vw,460px)', height: '100dvh', maxHeight: 1000, overflow: 'hidden', background: '#06080c', color: '#e8edf4' }}>
        <canvas ref={e.setCanvas} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />

        {access ? (<>
          {s === 'title' && <Title e={e} />}
          {s === 'map' && <MapScreen e={e} />}
          {s === 'game' && <PauseBtn e={e} />}
          {s === 'game' && <MuteBtn />}
          {s === 'game' && <SpeedControl e={e} />}
          {s === 'pause' && <Pause e={e} />}
          {(s === 'upgrade' || s === 'poderes') && <Shop e={e} />}
          {s === 'victory' && <End e={e} />}
          {s === 'defeat' && <DeathScreen e={e} />}
          {s === 'lab' && <Lab e={e} />}
        </>) : <AccessGate onUnlock={() => setAccess(true)} />}
      </div>
    </div>
  )
}

// ---------- shared styles ----------
const primaryBtn: React.CSSProperties = {
  padding: 16, borderRadius: 14, border: 'none', background: '#ffe6b0',
  color: '#1a1206', font: `600 16px ${F}`, letterSpacing: '0.02em',
  cursor: 'pointer', boxShadow: '0 0 30px rgba(255,230,176,0.25)',
}

// Portão minimalista: SÓ um campo de 6 dígitos. Digita e Enter; código certo (hash) libera e lembra no aparelho.
function AccessGate({ onUnlock }: { onUnlock: () => void }) {
  const [val, setVal] = useState('')
  const [err, setErr] = useState(false)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (busy || val.length < 6) return
    setBusy(true)
    const ok = (await sha256Hex(val)) === ACCESS_HASH
    if (ok) { try { localStorage.setItem('lumen_access', '1') } catch { /* ignore */ } ; onUnlock() }
    else { setErr(true); setVal(''); setBusy(false); setTimeout(() => setErr(false), 450) }
  }
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#06080c' }}>
      <input type="password" value={val} autoFocus inputMode="numeric" pattern="[0-9]*" maxLength={6}
        onChange={ev => { setVal(ev.target.value.replace(/\D/g, '').slice(0, 6)); setErr(false) }}
        onKeyDown={ev => { if (ev.key === 'Enter') submit() }}
        style={{ width: 176, padding: '14px 0', borderRadius: 12, border: `1px solid ${err ? '#c96' : 'rgba(255,255,255,0.14)'}`, background: 'rgba(255,255,255,0.04)', color: '#e8edf4', font: `600 26px ${F}`, textAlign: 'center', outline: 'none', letterSpacing: '0.55em', caretColor: '#ffe6b0' }} />
    </div>
  )
}

function PauseBtn({ e }: { e: Engine }) {
  return (
    <button onClick={e.pauseGame} style={{ position: 'absolute', top: 16, right: 16, width: 38, height: 38, borderRadius: 11, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(10,15,24,0.5)', color: '#cfd6e2', font: `600 13px ${F}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', letterSpacing: 1, backdropFilter: 'blur(6px)' }}>II</button>
  )
}

function MuteBtn() {
  const [muted, setMuted] = useState(false)
  const btnStyle: React.CSSProperties = { position: 'absolute', top: 16, right: 62, width: 38, height: 38, borderRadius: 11, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(10,15,24,0.5)', color: muted ? 'rgba(150,150,160,0.6)' : '#cfd6e2', font: `600 16px ${F}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)' }
  return (
    <button onClick={() => setMuted(audio.toggleMute())} style={btnStyle}>
      {muted ? '🔇' : '🔊'}
    </button>
  )
}

function SpeedControl({ e }: { e: Engine }) {
  // Acelerar (2×/5×/10×) é uma RECOMPENSA por assistir um vídeo. Bloqueado = 🔒; ao assistir libera a partida.
  // Em modo DEV o "vídeo" é simulado (3s) e a recompensa é entregue ao final.
  const speeds = [1, 2, 5, 10]
  const [modal, setModal] = useState<'' | 'offer'>('')
  const [note, setNote] = useState('')
  const timers = useRef<number[]>([])
  useEffect(() => () => { timers.current.forEach(clearTimeout) }, [])
  const after = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)) }

  const cycle = () => { const i = speeds.indexOf(e.speed); e.setSpeed(speeds[(i + 1) % speeds.length]) }
  // DEV: não exibe vídeo — só ATIVA e mostra a mensagem. Em produção o AdMob mostra o vídeo antes de resolver.
  const activate = async () => {
    const ok = await showRewardedAd()
    setModal('')
    if (!ok) return
    e.adFast = true; e.setSpeed(2) // recompensa: libera 2×/5×/10× e já entra em 2×
    setNote('📺 Anúncio ativado · jogo acelerado liberado!')
    after(2800, () => setNote(''))
  }
  const accel = e.speed > 1

  return (
    <>
      {/* botão de velocidade (canto inf. esq.) — bloqueado até assistir o vídeo */}
      {e.adFast ? (
        <button onClick={cycle} aria-label="Velocidade" title="Velocidade"
          style={{ position: 'absolute', bottom: 16, left: 16, minWidth: 54, height: 38, padding: '0 12px', borderRadius: 11, cursor: 'pointer', border: `1px solid ${accel ? 'transparent' : 'rgba(255,255,255,0.12)'}`, background: accel ? '#ffe6b0' : 'rgba(10,15,24,0.5)', color: accel ? '#1a1206' : '#cfd6e2', font: `700 15px ${F}`, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)', boxShadow: accel ? '0 0 16px rgba(255,230,176,0.35)' : 'none' }}>
          {e.speed}×
        </button>
      ) : (
        <button onClick={() => setModal('offer')} aria-label="Acelerar" title="Assista um vídeo e acelere o jogo"
          style={{ position: 'absolute', bottom: 16, left: 16, height: 38, padding: '0 11px', borderRadius: 11, cursor: 'pointer', border: '1px solid rgba(255,230,176,0.55)', background: 'rgba(255,230,176,0.12)', color: '#ffe6b0', font: `700 14px ${F}`, display: 'flex', alignItems: 'center', gap: 5, backdropFilter: 'blur(6px)', boxShadow: '0 0 14px rgba(255,230,176,0.18)' }}>
          <span style={{ fontSize: 12 }}>🔒</span>2×<span style={{ fontSize: 12, opacity: 0.85 }}>📺</span>
        </button>
      )}

      {/* nota discreta no canto inf. dir. — confirma a recompensa */}
      {note && <div style={{ position: 'absolute', bottom: 9, right: 11, maxWidth: 186, padding: '4px 8px', borderRadius: 8, background: 'rgba(10,15,24,0.5)', border: '1px solid rgba(255,255,255,0.06)', font: `500 9px ${F}`, color: '#9aa9bd', textAlign: 'right', pointerEvents: 'none', animation: 'fadeUp .3s ease' }}>{note}</div>}

      {/* TELA DE RECOMPENSA (oferta cativante) */}
      {modal === 'offer' && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 15, padding: 30, background: 'rgba(6,8,12,0.88)', backdropFilter: 'blur(8px)' }}>
          <div style={{ font: `600 10px ${F}`, letterSpacing: '0.34em', color: '#a08a4e' }}>RECOMPENSA</div>
          <div style={{ font: `300 31px ${F}`, color: '#fff', textAlign: 'center', lineHeight: 1.1, textShadow: '0 0 24px rgba(255,230,176,0.3)' }}>Acelere o jogo ⚡</div>
          <div style={{ display: 'flex', gap: 8 }}>{[2, 5, 10].map(s => <div key={s} style={{ padding: '6px 13px', borderRadius: 10, background: 'rgba(255,230,176,0.14)', border: '1px solid rgba(255,230,176,0.4)', color: '#ffe6b0', font: `700 16px ${F}` }}>{s}×</div>)}</div>
          <div style={{ font: `400 13px ${F}`, color: '#9aa9bd', textAlign: 'center', maxWidth: 280, lineHeight: 1.5 }}>Assista a um vídeo rápido e jogue acelerado o resto desta partida.</div>
          <button onClick={activate} style={{ width: '100%', maxWidth: 300, marginTop: 4, padding: 15, borderRadius: 14, border: 'none', background: '#ffe6b0', color: '#1a1206', font: `700 15px ${F}`, cursor: 'pointer', boxShadow: '0 0 30px rgba(255,230,176,0.45)' }}>▶ Assistir vídeo</button>
          <button onClick={() => setModal('')} style={{ padding: '8px 14px', borderRadius: 11, border: '1px solid rgba(255,255,255,0.14)', background: 'transparent', color: '#8a95a6', font: `500 13px ${F}`, cursor: 'pointer' }}>Agora não</button>
        </div>
      )}

    </>
  )
}

// ---------- Title ----------
function Title({ e }: { e: Engine }) {
  const [confirmReset, setConfirmReset] = useState(false) // recomeçar pede 2 toques (evita zerar sem querer)
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center', padding: '11% 30px 12%', textAlign: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <div style={{ font: `500 12px ${F}`, letterSpacing: '0.42em', color: '#7f8aa0', paddingLeft: '0.42em' }}>SEMENTE NO VAZIO</div>
        <h1 style={{ font: `300 56px ${F}`, letterSpacing: '0.04em', margin: 0, lineHeight: 1, textShadow: '0 0 40px rgba(255,235,190,0.25)' }}>Lumen Void</h1>
        <p style={{ font: `400 15px ${F}`, color: '#8a95a6', margin: 0, maxWidth: 280, lineHeight: 1.5 }}>Um núcleo de luz resiste ao vazio. Sobreviva, derrote os chefes e desperte as forças da natureza.</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 300 }}>
        <button onClick={e.goMap} style={primaryBtn}>Jogar</button>
        {/* Run 1: a Luz ainda não foi despertada → só JOGAR. Melhorias aparece após o despertar. */}
        {e.coreUnlocked && (
          <button onClick={e.goPoderes} style={{ padding: 15, borderRadius: 14, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.03)', color: '#e8edf4', font: `500 15px ${F}`, cursor: 'pointer' }}>
            Melhorias{e.coins > 0 ? <> · <span style={{ color: '#ffe6b0' }}>{e.coins} ✦</span></> : ''}
          </button>
        )}
        {/* Recomeçar: só aparece quando há progresso salvo (Luz despertada). 2 toques p/ confirmar. */}
        {e.coreUnlocked && (
          <button onClick={() => { if (confirmReset) { e.resetProgress() } else { setConfirmReset(true); setTimeout(() => setConfirmReset(false), 3000) } }}
            style={{ marginTop: 2, padding: 9, borderRadius: 11, border: 'none', background: 'transparent', color: confirmReset ? '#e8a0a0' : '#5f6a7c', font: `500 12px ${F}`, letterSpacing: '0.04em', cursor: 'pointer' }}>
            {confirmReset ? 'Tem certeza? Toque de novo para apagar tudo' : 'Recomeçar'}
          </button>
        )}
        {/* Ferramenta de teste: sandbox de poderes (não afeta o progresso) */}
        <button onClick={e.startLab} style={{ marginTop: 2, padding: 9, borderRadius: 11, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#9aa9bd', font: `500 12px ${F}`, letterSpacing: '0.04em', cursor: 'pointer' }}>🧪 Laboratório</button>
      </div>
    </div>
  )
}

// ---------- Map ----------
function MapScreen({ e }: { e: Engine }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: '54px 22px 24px', background: 'rgba(6,8,12,0.55)', overflowY: 'auto' }}>
      <div style={{ font: `500 11px ${F}`, letterSpacing: '0.34em', color: '#7f8aa0', marginBottom: 6 }}>CAMADAS DO VAZIO</div>
      <h2 style={{ font: `300 30px ${F}`, margin: '0 0 20px', letterSpacing: '0.02em' }}>Escolha a fase</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {MAPS.map((m, i) => {
          const locked = i >= e.unlocked
          const beaten = e.bossesBeaten[m.id]
          return (
            <button key={m.id} onClick={() => e.selectMap(i)} style={{ width: '100%', padding: 15, borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', cursor: locked ? 'not-allowed' : 'pointer', opacity: locked ? 0.4 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 44, height: 44, flex: 'none', borderRadius: 12, background: `radial-gradient(circle at 40% 35%, ${m.palette.accent}, ${m.palette.void})`, border: '1px solid rgba(255,255,255,0.1)' }} />
                <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ font: `600 17px ${F}` }}>{m.name}</span>
                    <span style={{ font: `600 11px ${F}`, color: '#ffd98a', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>DIF {m.diff}/7</span>
                  </div>
                  <div style={{ font: `400 13px ${F}`, color: '#8a95a6', marginTop: 4 }}>{m.waves} ondas · {locked ? 'bloqueado' : 'disponível'}</div>
                  <div style={{ font: `400 12px ${F}`, color: '#9aa9bd', marginTop: 3 }}>{beaten ? 'Chefe derrotado ✓' : 'Chefe: +1 selo de poder'}</div>
                </div>
              </div>
            </button>
          )
        })}
      </div>
      <button onClick={e.goTitle} style={{ marginTop: 'auto', padding: 14, borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#8a95a6', font: `500 14px ${F}`, cursor: 'pointer' }}>Voltar</button>
    </div>
  )
}

// ---------- Pause ----------
function Pause({ e }: { e: Engine }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 14, padding: 30, background: 'rgba(6,8,12,0.78)', backdropFilter: 'blur(8px)' }}>
      <h2 style={{ font: `300 30px ${F}`, margin: '0 0 10px', letterSpacing: '0.04em' }}>Pausa</h2>
      <button onClick={e.resume} style={{ width: '100%', maxWidth: 280, padding: 15, borderRadius: 13, border: 'none', background: '#ffe6b0', color: '#1a1206', font: `600 15px ${F}`, cursor: 'pointer' }}>Continuar</button>
      <button onClick={e.abandon} style={{ width: '100%', maxWidth: 280, padding: 14, borderRadius: 13, border: '1px solid rgba(255,255,255,0.14)', background: 'transparent', color: '#c98a8a', font: `500 14px ${F}`, cursor: 'pointer' }}>Abandonar run</button>
    </div>
  )
}

// ---------- Laboratório (sandbox de testes de poder) ----------
function Lab({ e }: { e: Engine }) {
  const speeds = [1, 2, 5, 10]
  const cycleSpeed = () => { const i = speeds.indexOf(e.speed); e.setSpeed(speeds[(i + 1) % speeds.length]) }
  const stepBtn: React.CSSProperties = { width: 28, height: 28, flex: 'none', borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.09)', color: '#e8edf4', font: `700 16px ${F}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }
  const sections = [
    ...(e.labLuzOn ? [{ key: 'base', name: 'LUZ', color: BASE.color, nodes: BASE.nodes as any[] }] : []),
    ...ORDER.filter(k => e.labForces.includes(k)).map(k => ({ key: k as string, name: PATHS[k].name.toUpperCase(), color: PATHS[k].color, nodes: PATHS[k].nodes as any[] })),
  ]
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '44%', display: 'flex', flexDirection: 'column', background: 'rgba(6,8,12,0.93)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', borderTop: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px 16px 0 0' }}>
      {/* cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={e.exitLab} aria-label="Voltar" style={{ flex: 'none', width: 30, height: 30, borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(10,15,24,0.5)', color: '#cfd6e2', font: `600 15px ${F}`, cursor: 'pointer' }}>←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: `500 9px ${F}`, letterSpacing: '0.28em', color: '#7f8aa0' }}>LABORATÓRIO</div>
          <div style={{ font: `300 16px ${F}`, marginTop: 1 }}>Teste de poderes</div>
        </div>
        <button onClick={e.labRespawn} style={{ flex: 'none', padding: '6px 10px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.14)', background: 'transparent', color: '#cfd6e2', font: `600 11px ${F}`, cursor: 'pointer' }}>Alvos</button>
        <button onClick={cycleSpeed} style={{ flex: 'none', minWidth: 40, padding: '6px 10px', borderRadius: 9, border: 'none', background: e.speed > 1 ? '#ffe6b0' : 'rgba(255,255,255,0.09)', color: e.speed > 1 ? '#1a1206' : '#e8edf4', font: `700 12px ${F}`, cursor: 'pointer' }}>{e.speed}×</button>
      </div>
      {/* toggles de força — Luz também pode ser desligada */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 12px 6px' }}>
        <button onClick={e.labToggleLuz} style={{ padding: '5px 10px', borderRadius: 9, border: `1px solid ${e.labLuzOn ? withA(BASE.color, 0.6) : 'rgba(255,255,255,0.14)'}`, background: e.labLuzOn ? withA(BASE.color, 0.18) : 'transparent', color: e.labLuzOn ? BASE.color : '#8a95a6', font: `700 11px ${F}`, cursor: 'pointer' }}>LUZ</button>
        {ORDER.map(k => {
          const on = e.labForces.includes(k); const col = PATHS[k].color
          return (
            <button key={k} onClick={() => e.labToggleForce(k)} style={{ padding: '5px 10px', borderRadius: 9, border: `1px solid ${on ? col : 'rgba(255,255,255,0.14)'}`, background: on ? withA(col, 0.18) : 'transparent', color: on ? col : '#8a95a6', font: `600 11px ${F}`, cursor: 'pointer' }}>{PATHS[k].name}</button>
          )
        })}
      </div>
      {/* níveis por nó (rolável) */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '2px 12px 16px' }}>
        {sections.map(sec => (
          <div key={sec.key} style={{ marginBottom: 8 }}>
            {/* título + SELECT de variação do poder base (5 opções) */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '8px 0 3px' }}>
              <div style={{ font: `700 10px ${F}`, letterSpacing: '0.14em', color: sec.color }}>{sec.name}</div>
              <select value={e.variant(sec.key)} onChange={ev => e.labSetVariant(sec.key, +ev.target.value)}
                style={{ flex: 'none', maxWidth: 152, padding: '4px 6px', borderRadius: 8, border: `1px solid ${withA(sec.color, 0.4)}`, background: 'rgba(10,15,24,0.7)', color: '#e8edf4', font: `600 10px ${F}`, cursor: 'pointer' }}>
                {VARIANTS[sec.key].map((name, i) => <option key={i} value={i} style={{ background: '#0c1118', color: '#e8edf4' }}>{name}</option>)}
              </select>
            </div>
            {sec.nodes.map((n: any) => {
              const L = e.lvl(n.id)
              return (
                <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: `600 11px ${F}`, color: '#e8edf4', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.name}</div>
                    <div style={{ font: `400 9px ${F}`, color: '#8a95a6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.desc}</div>
                  </div>
                  <button onClick={() => e.labSetLevel(n.id, -1)} style={stepBtn}>−</button>
                  <div style={{ minWidth: 32, textAlign: 'center', font: `700 12px ${F}`, color: L > 0 ? sec.color : '#5f6a7c' }}>{L}/{MAX_LVL}</div>
                  <button onClick={() => e.labSetLevel(n.id, 1)} style={stepBtn}>+</button>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- Árvore RADIAL (adaptada ao mobile, com pan/zoom) ----------
const BR_ANGLE: Record<string, number> = { luz: -90, storm: -30, volcano: 30, terra: 90, forest: 150, frost: 210 }
type NodeMeta = { node: any; color: string; force?: ForceKey; depth?: number }
// rótulo curto do efeito, direto no nó (ex.: "+1 DANO")
const SHORT: Record<string, string> = {
  b_dmg: '+1 DANO', b_rate: '+CADÊNCIA', b_hp: '+10 VIDA', b_pierce: 'PERFURA', b_crit: '+10% CRIT',
  b_regen: 'REGEN', b_area: 'AURA', b_proj: '+VELOC.', b_shatter: 'EXPLODE', b_leech: 'VIDA/KILL',
  b_range: '+ALCANCE', b_luz: '+1 ✦/KILL',
  storm_volt: '+5 DANO', storm_cad: '+CADÊNCIA', storm_chain: '+1 SALTO', storm_range: '+ALCANCE', storm_over: '+12% CRIT',
  vol_pow: '+8 DANO', vol_rate: '+CADÊNCIA', vol_rad: '+14 RAIO', vol_burn: '+QUEIMA', vol_zone: '+LAVA',
  for_thorn: '+4 DANO', for_root: '+24 RAIO', for_heal: '+3 CURA', for_regen: 'CURA+', for_vigor: '+8 VIDA',
  fro_cold: 'LENTIDÃO', fro_nova: '+7 DANO', fro_freeze: '+CONGELA', fro_crys: '+25 RAIO', fro_barr: '+6% DEF',
  ter_imp: '+8 DANO', ter_quake: '+CADÊNCIA', ter_knock: '+25 RECUO', ter_wall: '+7% DEF', ter_weight: '+30 RAIO',
}
const shortOf = (id: string, name: string) => SHORT[id] || name.toUpperCase()

// Raiz da Árvore da Luz (1ª skill). Revelação progressiva: um nó da Luz é REVELADO se for a raiz,
// filho direto da raiz, ou se seu pré-requisito já tem nível ≥1. Caso contrário é MISTÉRIO ('?').
const LUZ_ROOT = BASE.nodes.find(n => !n.requires)!.id
const isRevealed = (e: Engine, node: { requires?: string }) =>
  !node.requires || node.requires === LUZ_ROOT || e.lvl(node.requires) >= 1

type TreePt = { id: string; x: number; y: number; meta: NodeMeta }

function buildPts(CX: number, CY: number, e: Engine) {
  const pts: TreePt[] = []
  // Profundidade na cadeia de requisitos (as forças não têm `tier`) — com fallback robusto via requires.
  const depthOf = (nodes: any[]) => {
    const idx = new Map<string, number>(nodes.map((n, i) => [n.id as string, i]))
    const memo = new Map<string, number>()
    const walk = (n: any): number => {
      if (memo.has(n.id)) return memo.get(n.id)!
      const d = (n.requires != null && idx.has(n.requires)) ? walk(nodes[idx.get(n.requires)!]) + 1 : 0
      memo.set(n.id, d); return d
    }
    return (n: any) => walk(n)
  }
  const place = (nodes: any[], color: string, baseAng: number, force: ForceKey | undefined, spread: number, lockedForce = false) => {
    const dep = force ? depthOf(nodes) : null
    nodes.forEach(n => {
      const depth = force ? dep!(n) : (n.tier ?? 0) // FORÇAS: profundidade da cadeia; LUZ: tier do dado
      const ring = depth + 1
      const nx = force ? 0.5 : (n.nx ?? 0.5) // FORÇAS: raio RETO, alinhado ao núcleo; LUZ: nx do dado
      const a = (baseAng + (nx - 0.5) * spread) * Math.PI / 180
      const r = lockedForce ? 172 : (24 + ring * 96) // força trancada: card único empurrado p/ fora (cabe sem sobrepor)
      pts.push({ id: n.id, x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r, meta: { node: n, color, force, depth } })
    })
  }
  place(BASE.nodes, BASE.color, BR_ANGLE.luz, undefined, 88)
  // Força LIBERADA: árvore inteira. Força TRANCADA: só o nó de entrada (vira card elaborado de liberar, empurrado p/ fora).
  for (const k of ORDER) { const unlocked = e.has(k); const nodes = unlocked ? PATHS[k].nodes : PATHS[k].nodes.filter((n: any) => !n.requires); place(nodes, PATHS[k].color, BR_ANGLE[k], k, 26, !unlocked) }
  return pts
}

function RadialTree({ e, selected, onSelect, lastUpgraded, fromGate }: { e: Engine; selected: string; onSelect: (id: string) => void; lastUpgraded: string; fromGate?: boolean }) {
  const CX = 540, CY = 540
  const pts = buildPts(CX, CY, e)

  const [VH, setVH] = useState(480)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(0.5)
  const [animating, setAnimating] = useState(false)
  const [transMs, setTransMs] = useState(800)
  const [ready, setReady] = useState(false) // só mostra a árvore após medir o box (evita flash descentralizado)
  const box = useRef<HTMLDivElement>(null)

  // drag state: também guarda se houve movimento (para distinguir click de pan)
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null)
  const panRef = useRef(pan)
  const zoomRef = useRef(zoom)
  panRef.current = pan; zoomRef.current = zoom

  // Entrada: 1º momento já em 50% CENTRALIZADO no núcleo (sem transição);
  // 2º momento dá zoom suave até 150% focando o último nó evoluído.
  useLayoutEffect(() => {
    let raf1 = 0, raf2 = 0, to = 0
    const run = () => {
      const w = box.current?.clientWidth || 0, h = box.current?.clientHeight || 0
      if (!w || !h) { raf1 = requestAnimationFrame(run); return } // aguarda o layout do flex/dvh resolver
      setVH(h)
      // Com selo e NENHUMA força liberada: direciona e trava no CENTRO (núcleo + raios) até liberar 1 força.
      const lockedCards = e.coreUnlocked && ORDER.some(k => !e.has(k)) // há cards elaborados de força ao redor
      const frameCenter = lockedCards || (e.tokens > 0 && e.unlockedForces.length === 0)
      const target = (!frameCenter && lastUpgraded) ? pts.find(p => p.id === lastUpgraded) : null
      const tx = target ? target.x : CX, ty = target ? target.y : CY
      // Vindo do portão (acordar): entra no tamanho do herói (centrado) e abre suave revelando as skills.
      const startZ = fromGate ? 1.5 : 0.5, endZ = frameCenter ? 0.8 : 1.5
      // 1º momento: 50% centralizado no núcleo, sem transição (já entra centralizado)
      setAnimating(false)
      setZoom(startZ)
      setPan({ x: w / 2 - CX * startZ, y: h / 2 - CY * startZ })
      setReady(true)
      // 2º momento: habilita a transição e faz o zoom leve até o último item
      raf2 = requestAnimationFrame(() => {
        setTransMs(fromGate ? 1000 : 800)
        setAnimating(true)
        requestAnimationFrame(() => {
          setZoom(endZ)
          setPan({ x: w / 2 - tx * endZ, y: h / 2 - ty * endZ })
          to = window.setTimeout(() => setAnimating(false), 850)
        })
      })
    }
    run()
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); clearTimeout(to) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Ao selecionar um nó, centraliza-o na tela (zoom de leitura confortável)
  const firstSel = useRef(true)
  useEffect(() => {
    if (firstSel.current) { firstSel.current = false; return } // ignora o mount (nada selecionado)
    if (!selected) return
    const t = pts.find(p => p.id === selected); if (!t) return
    const w = box.current?.clientWidth || 340, h = box.current?.clientHeight || 480
    const z = Math.max(zoomRef.current, 1.5)
    setTransMs(420)
    setAnimating(true)
    setZoom(z)
    setPan({ x: w / 2 - t.x * z, y: h / 2 - t.y * z })
    const id = setTimeout(() => setAnimating(false), 460)
    return () => clearTimeout(id)
  }, [selected]) // eslint-disable-line react-hooks/exhaustive-deps

  const posOf = (id: string) => pts.find(p => p.id === id)

  const stateOf = (m: NodeMeta) => {
    const forceLocked = !!m.force && !e.has(m.force)
    if (forceLocked) return 'force'
    // Mistério: nó da Luz cujo pré-requisito ainda não foi liberado — só revela ao liberar a skill anterior.
    if (!m.force && !isRevealed(e, m.node)) return 'mystery'
    if (!e.nodeUnlocked(m.node)) return 'locked'
    const L = e.lvl(m.node.id)
    return L >= MAX_LVL ? 'max' : L > 0 ? 'owned' : 'avail'
  }

  const applyZoom = (f: number, pivotX: number, pivotY: number) => {
    const nz = Math.max(0.35, Math.min(2.4, zoomRef.current * f))
    const ratio = nz / zoomRef.current
    setPan({ x: pivotX - (pivotX - panRef.current.x) * ratio, y: pivotY - (pivotY - panRef.current.y) * ratio })
    setZoom(nz)
  }

  const zoomBy = (f: number) => {
    const w = box.current?.clientWidth ?? 340
    applyZoom(f, w / 2, VH / 2)
  }

  return (
    <div ref={box} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', borderRadius: 16, background: 'radial-gradient(circle at 50% 50%, rgba(255,230,176,0.05), rgba(0,0,0,0.18))', border: '1px solid rgba(255,255,255,0.06)', touchAction: 'none' }}
      onPointerDown={ev => {
        // Não capturar eventos de botões — deixa o click dos nós e controles funcionarem
        if ((ev.target as Element).closest('button')) return
        drag.current = { x: ev.clientX, y: ev.clientY, px: panRef.current.x, py: panRef.current.y, moved: false }
        ev.currentTarget.setPointerCapture(ev.pointerId)
      }}
      onPointerMove={ev => {
        if (!drag.current) return
        const dx = ev.clientX - drag.current.x, dy = ev.clientY - drag.current.y
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.current.moved = true
        setPan({ x: drag.current.px + dx, y: drag.current.py + dy })
      }}
      onPointerUp={() => { drag.current = null }}
      onWheel={ev => {
        ev.preventDefault()
        const rect = box.current!.getBoundingClientRect()
        applyZoom(ev.deltaY < 0 ? 1.12 : 1 / 1.12, ev.clientX - rect.left, ev.clientY - rect.top)
      }}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin: '0 0', transition: animating ? `transform ${transMs}ms cubic-bezier(0.25,0.8,0.25,1)` : 'none', visibility: ready ? 'visible' : 'hidden' }}>
        <svg width={CX * 2} height={CY * 2} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', overflow: 'visible' }}>
          {pts.map(p => { const par = p.meta.node.requires ? posOf(p.meta.node.requires) : { x: CX, y: CY }; if (!par) return null; const on = p.meta.node.requires ? e.lvl(p.meta.node.requires) >= 1 : true; const fk = p.meta.force; const funlocked = fk ? e.has(fk) : false; const lit = on && !(fk && !e.has(fk)); return <line key={'l' + p.id} x1={par.x} y1={par.y} x2={p.x} y2={p.y} stroke={lit ? withA(p.meta.color, funlocked ? 0.7 : 0.45) : (fk ? withA(p.meta.color, 0.24) : 'rgba(255,255,255,0.07)')} strokeWidth={funlocked ? 4 : (fk ? 2.5 : 2)} style={funlocked ? { filter: `drop-shadow(0 0 4px ${withA(p.meta.color, 0.6)})` } : undefined} /> })}
        </svg>
        {/* núcleo central */}
        <div style={{ position: 'absolute', left: CX, top: CY, transform: 'translate(-50%,-50%)', width: 58, height: 58, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          {/* aura externa que respira (pulsa) */}
          <div style={{ position: 'absolute', left: '50%', top: '50%', width: 152, height: 152, transform: 'translate(-50%,-50%)', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,236,190,0.34), rgba(255,230,176,0.06) 50%, rgba(255,230,176,0) 72%)', animation: 'lumenBreath 3.2s ease-in-out infinite' }} />
          {/* disco de luz quente atrás do herói */}
          <div style={{ position: 'absolute', left: '50%', top: '50%', width: 70, height: 70, transform: 'translate(-50%,-50%)', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,249,228,0.85), rgba(255,232,182,0.28) 52%, rgba(255,230,176,0) 76%)' }} />
          {/* herói pequeno ao centro, com MUITO brilho como contorno (várias drop-shadows) */}
          <img src={`${import.meta.env.BASE_URL}hero.png`} alt="" draggable={false}
            style={{ position: 'relative', width: 26, height: 'auto', filter: 'drop-shadow(0 0 2px #fffef8) drop-shadow(0 0 6px rgba(255,240,200,0.95)) drop-shadow(0 0 14px rgba(255,224,160,0.85)) drop-shadow(0 0 26px rgba(255,208,130,0.55))', animation: 'lvpop 2.8s ease-in-out infinite' }} />
        </div>
        {/* rótulo do nome de cada força, na entrada do raio (entre o núcleo e o 1º nó) */}
        {ORDER.map(k => {
          const a = BR_ANGLE[k] * Math.PI / 180
          const lx = CX + Math.cos(a) * 78, ly = CY + Math.sin(a) * 78
          const unlocked = e.has(k)
          // Modo flutuante (run 1, sem selo): o nome é carregado pelo glifo flutuante — não duplica o rótulo fixo.
          if (!unlocked && !(e.tokens > 0 && e.unlockedForces.length < 2)) return null
          const col = PATHS[k].color // sempre a cor do caminho, mesmo trancada
          return (
            <div key={'flbl' + k} style={{ position: 'absolute', left: lx, top: ly, transform: 'translate(-50%,-50%)', font: `700 9px ${F}`, letterSpacing: '0.16em', whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 2, color: col, opacity: unlocked ? 1 : 0.92, textShadow: `0 0 3px rgba(6,8,12,0.95), 0 0 8px ${withA(col, unlocked ? 0.75 : 0.45)}` }}>
              {PATHS[k].name.toUpperCase()}{unlocked ? '' : ' ❖'}
            </div>
          )
        })}
        {/* título do caminho da Luz (mesmo estilo dos títulos das forças) */}
        <div style={{ position: 'absolute', left: CX, top: CY - 78, transform: 'translate(-50%,-50%)', font: `700 9px ${F}`, letterSpacing: '0.16em', whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 2, color: BASE.color, textShadow: `0 0 3px rgba(6,8,12,0.95), 0 0 8px ${withA(BASE.color, 0.75)}` }}>LUZ</div>
        {pts.map(p => {
          const st = stateOf(p.meta)
          // Run 1 (força trancada e SEM Selo ❖ pra gastar): nada de card — só o símbolo + nome flutuando.
          if (st === 'force' && !(e.tokens > 0 && e.unlockedForces.length < 2))
            return <FloatingForce key={p.id} p={p} idx={ORDER.indexOf(p.meta.force!)} />
          return (
            <NodeCard key={p.id} e={e} p={p} st={st} selected={selected === p.id}
              onSelect={() => { if (!drag.current?.moved) onSelect(p.id) }} />
          )
        })}
      </div>
      {/* controles de zoom */}
      <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 20, background: 'rgba(10,15,24,0.6)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(6px)', zIndex: 2 }}>
        <button onPointerDown={ev => ev.stopPropagation()} onClick={() => zoomBy(1 / 1.3)} style={zbtn}>–</button>
        <span style={{ font: `600 10px ${F}`, color: '#aeb7c6', minWidth: 34, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
        <button onPointerDown={ev => ev.stopPropagation()} onClick={() => zoomBy(1.3)} style={zbtn}>+</button>
        <span style={{ font: `500 8px ${F}`, color: '#6f7a8c', letterSpacing: '0.1em', marginLeft: 4 }}>ARRASTE</span>
      </div>
    </div>
  )
}
const zbtn: React.CSSProperties = { width: 26, height: 26, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.08)', color: '#e8edf4', font: `700 14px ${F}`, cursor: 'pointer' }

// Anel segmentado em torno do ícone — 1 segmento por nível possível (MAX_LVL).
// Substitui o texto "L/5": o progresso é lido pelos arcos preenchidos.
function SegRing({ level, color, size, justFilled }: { level: number; color: string; size: number; justFilled?: boolean }) {
  // gap angular AMPLO: as pontas arredondadas (cap=round) somam ~7.8° por segmento; com gap=5°
  // os níveis se fundiam num arco liso. gap=16° deixa cada etapa/nível visivelmente separada.
  const C = size / 2, R = size / 2 - 3, max = MAX_LVL, span = 360 / max, gap = 16
  const polar = (deg: number) => { const a = (deg - 90) * Math.PI / 180; return [C + R * Math.cos(a), C + R * Math.sin(a)] as const }
  const seg = (i: number) => {
    const [x0, y0] = polar(i * span + gap / 2)
    const [x1, y1] = polar((i + 1) * span - gap / 2)
    return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${R} ${R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
  }
  return (
    <svg width={size} height={size} style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', overflow: 'visible', pointerEvents: 'none' }}>
      {Array.from({ length: max }, (_, i) => {
        const on = i < level, newest = justFilled && i === level - 1
        return <path key={i} d={seg(i)} fill="none" strokeWidth={3} strokeLinecap="round"
          stroke={on ? color : 'rgba(255,255,255,0.12)'}
          style={on ? { filter: `drop-shadow(0 0 ${newest ? 4 : 2}px ${withA(color, 0.9)})` } : undefined} />
      })}
    </svg>
  )
}

// Força ainda trancada na run 1 (sem Selo ❖): NÃO mostra card de melhoria — apenas o
// símbolo + nome, flutuando devagar perto do lugar e girando de leve no eixo horizontal.
function FloatingForce({ p, idx }: { p: TreePt; idx: number }) {
  const col = p.meta.color
  const name = PATHS[p.meta.force!].name.toUpperCase()
  const driftDelay = (-idx * 0.7).toFixed(2) + 's'  // desincroniza o drift entre as forças
  const spinDelay = (-idx * 0.5).toFixed(2) + 's'
  const [show, setShow] = useState(false) // ao clicar, mostra a mensagem por alguns segundos
  const hideT = useRef<number | null>(null)
  useEffect(() => () => { if (hideT.current) clearTimeout(hideT.current) }, [])
  const tap = () => { setShow(true); if (hideT.current) clearTimeout(hideT.current); hideT.current = window.setTimeout(() => setShow(false), 2800) }
  return (
    <div onPointerDown={ev => ev.stopPropagation()} onClick={tap}
      style={{ position: 'absolute', left: p.x, top: p.y, transform: 'translate(-50%,-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer', animation: `floatBob 5.5s ease-in-out ${driftDelay} infinite` }}>
      {/* símbolo: losango da cor da força, girando levemente em rotateY */}
      <div style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: `spinY 7s ease-in-out ${spinDelay} infinite` }}>
        <div style={{ width: 26, height: 26, transform: 'rotate(45deg)', borderRadius: 7,
          background: `linear-gradient(135deg, ${withA(col, 0.5)}, ${withA(col, 0.1)})`,
          border: `1.5px solid ${withA(col, 0.7)}`,
          boxShadow: `0 0 12px ${withA(col, 0.5)}, inset 0 0 8px ${withA(col, 0.35)}` }} />
      </div>
      {/* nome flutuante, na cor do caminho */}
      <div style={{ font: `700 9px ${F}`, letterSpacing: '0.16em', whiteSpace: 'nowrap', color: col, textShadow: `0 0 3px rgba(6,8,12,0.95), 0 0 8px ${withA(col, 0.5)}` }}>{name}</div>
      {/* mensagem ao clicar: a força só libera vencendo a 1ª partida */}
      {show && (
        <div style={{ position: 'absolute', top: '100%', left: '50%', marginTop: 5, transform: 'translate(-50%,0)', width: 128, padding: '6px 9px', borderRadius: 9, background: 'rgba(10,12,18,0.94)', border: `1px solid ${withA(col, 0.45)}`, boxShadow: `0 0 14px ${withA(col, 0.3)}`, font: `500 8.5px/1.32 ${F}`, color: '#dfe5ee', textAlign: 'center', pointerEvents: 'none', zIndex: 6, animation: 'tipIn .22s ease' }}>
          Vença a partida 1 para liberar a força.
        </div>
      )}
    </div>
  )
}

// Card de um nó da árvore. Estado mínimo: anel + ícone + badge de nível.
// Selecionado: expande e mostra descrição + botão de compra. Pulso/brilho ao comprar.
function NodeCard({ e, p, st, selected, onSelect }: { e: Engine; p: TreePt; st: string; selected: boolean; onSelect: () => void }) {
  const { node, force } = p.meta
  const mystery = st === 'mystery'
  const col = mystery ? '#737d92' : p.meta.color // nó-mistério usa cor neutra (identidade oculta)
  const L = e.lvl(node.id)
  const c = e.nodeCost(node.baseCost, node.id)
  const dim = st === 'locked' || st === 'force' || mystery
  const filled = st === 'owned' || st === 'max'
  const bal = force ? e.forceCoins[force] : e.coins
  const canUnlock = st === 'force' && e.unlockedForces.length < 2 && e.tokens > 0
  const canAfford = bal >= c
  const buyable = st === 'avail' || st === 'owned' // pode evoluir enquanto não chegou ao MÁX
  const canBuy = buyable && canAfford
  const isEntry = !node.requires // raiz da cadeia (nó de entrada da força)
  const invite = st === 'force' && canUnlock && isEntry // entrada de força a liberar (você tem selo ❖)
  // Card ELABORADO de "liberar caminho" — força trancada COM Selo ❖ pra gastar (após vencer uma fase).
  // (Sem selo, na run 1, a força nem chega aqui: vira um glifo flutuante na RadialTree.)
  const lockedPath = st === 'force' && isEntry
  const expand = selected || lockedPath

  // pulso visual quando o nível sobe (retorno da compra)
  const [pulse, setPulse] = useState(false)
  const prevL = useRef(L)
  useEffect(() => {
    if (L > prevL.current) { setPulse(true); prevL.current = L; const t = setTimeout(() => setPulse(false), 650); return () => clearTimeout(t) }
    prevL.current = L
  }, [L])

  // botão de compra (apenas selecionado)
  let btnLabel = '', btnBg = '', btnColor = ''
  if (st === 'max') { btnLabel = '★ MÁX'; btnBg = 'rgba(255,255,255,0.07)'; btnColor = '#8a95a6' }
  else if (st === 'force') { btnLabel = canUnlock ? '1 ❖ Liberar' : '1 ❖ Selo'; btnBg = canUnlock ? '#d9b8ff' : 'rgba(255,255,255,0.07)'; btnColor = canUnlock ? '#1a1026' : '#9a86c0' }
  else if (st === 'locked') { btnLabel = '🔒 Bloqueado'; btnBg = 'rgba(255,255,255,0.05)'; btnColor = '#6f7a8c' }
  else { btnLabel = `${c} ${force ? '◈' : '✦'}`; btnBg = canBuy ? col : 'rgba(255,255,255,0.07)'; btnColor = canBuy ? '#06080c' : '#8a95a6' }

  const ringSize = 50, W = expand ? 116 : 58

  return (
    <div onPointerDown={ev => ev.stopPropagation()} onClick={onSelect}
      style={{ position: 'absolute', left: p.x, top: p.y, transform: 'translate(-50%,-50%)', width: W, padding: expand ? '11px 9px 9px' : '7px 6px', borderRadius: 14, cursor: 'pointer', textAlign: 'center',
        background: dim ? 'rgba(10,12,18,0.55)' : filled ? `linear-gradient(160deg,${withA(col, 0.22)},rgba(10,12,18,0.6))` : 'rgba(12,15,22,0.55)',
        backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)',
        border: `${selected || invite || lockedPath ? 2 : 1}px solid ${selected ? col : withA(col, dim && !invite && !lockedPath ? 0.16 : 0.42)}`,
        boxShadow: invite ? `0 0 20px ${withA(col, 0.85)},0 0 8px ${withA(col, 0.5)}` : pulse ? `0 0 26px ${withA(col, 0.95)},0 0 10px ${withA(col, 0.6)}` : selected ? `0 0 18px ${withA(col, 0.6)}` : lockedPath ? `0 0 14px ${withA(col, 0.5)}` : st === 'avail' ? `0 0 8px ${withA(col, 0.28)}` : 'none',
        opacity: invite ? 1 : (lockedPath ? 1 : (dim ? 0.66 : 1)), animation: invite ? 'lvpop 2.2s ease-in-out infinite' : undefined, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: expand ? 5 : 3, transition: 'width .18s,box-shadow .25s,border-color .2s,background .2s', zIndex: lockedPath ? 2 : (selected ? 3 : 1) }}>

      {/* badge de nível — metade fora do card, no canto */}
      {L > 0 && (
        <div style={{ position: 'absolute', top: -8, right: -8, minWidth: 18, height: 18, padding: '0 4px', borderRadius: 9,
          background: st === 'max' ? '#ffd24a' : '#ffe6b0', color: '#1a1206', font: `800 10px ${F}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 8px ${withA('#ffe6b0', 0.85)}`,
          border: '1.5px solid rgba(255,255,255,0.5)', animation: pulse ? 'badgePop .5s ease' : undefined, zIndex: 4 }}>{L}</div>
      )}

      {/* ícone com anel segmentado + pulso de compra */}
      <div style={{ position: 'relative', width: ringSize, height: ringSize, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <SegRing level={L} color={col} size={ringSize} justFilled={pulse} />
        {pulse && <div style={{ position: 'absolute', left: '50%', top: '50%', width: ringSize, height: ringSize, borderRadius: '50%', border: `2px solid ${col}`, animation: 'lumenPulse .65s ease-out forwards', pointerEvents: 'none' }} />}
        <div style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `radial-gradient(circle at 50% 40%, ${withA(col, 0.3)}, ${withA(col, 0.04)})`,
          animation: pulse ? 'lumenPop .5s ease' : undefined }}>
          {mystery ? <span style={{ fontSize: 17, fontWeight: 800, color: '#9aa3b5' }}>?</span> : st === 'force' ? <span style={{ fontSize: 14 }}>❖</span> : st === 'locked' ? <span style={{ fontSize: 13 }}>🔒</span> : <UpIcon cat={node.cat} color={col} size={17} />}
        </div>
      </div>

      {/* rótulo curto */}
      <div style={{ font: `700 ${expand ? 10 : 8.5}px/1.05 ${F}`, letterSpacing: '0.02em', color: st === 'force' ? col : (dim ? '#8a95a6' : '#e8edf4') }}>{mystery ? '???' : st === 'force' ? PATHS[force!].name.toUpperCase() : shortOf(node.id, node.name)}</div>

      {/* detalhes claros — só quando selecionado */}
      {expand && (mystery ? (
        <div style={{ font: `400 8.5px/1.3 ${F}`, color: '#8a93a6' }}>Mistério — libere a skill anterior para revelar.</div>
      ) : (
        <>
          <div style={{ font: `400 8.5px/1.3 ${F}`, color: '#9aa9bd' }}>{lockedPath ? 'Desperte esta força da natureza.' : node.desc}{!lockedPath && force ? ` · ${PATHS[force].name}` : ''}</div>
          <button onPointerDown={ev => ev.stopPropagation()}
            onClick={ev => { ev.stopPropagation(); if (st === 'force') { if (canUnlock && force) e.unlockForce(force) } else if (canBuy) { force ? e.buyForceNode(force, node.baseCost, node.id) : e.buyNode(node.baseCost, node.id) } }}
            style={{ width: '100%', marginTop: 1, padding: '6px 2px', borderRadius: 9, border: 'none', font: `800 10px ${F}`, cursor: (canBuy || canUnlock) ? 'pointer' : 'default', background: btnBg, color: btnColor, opacity: (buyable && !canAfford) ? 0.5 : 1 }}>
            {btnLabel}
          </button>
        </>
      ))}
    </div>
  )
}

function Shop({ e }: { e: Engine }) {
  const [sel, setSel] = useState('') // ao abrir a loja, nada selecionado
  const [fromGate, setFromGate] = useState(false) // acabou de acordar o núcleo → transição sutil p/ a árvore
  // Despertar a Luz: abre a Árvore da Luz NA HORA (sem cerimônia) — a transição fromGate faz a revelação suave.
  const awaken = () => {
    if (e.tokens < 1) return
    audio.play('upgrade')
    e.unlockCore(); setFromGate(true)
  }

  // Rolagem das fases: começa mostrando a MAIS RECENTE (à direita); as antigas ficam à esquerda.
  const phaseScroll = useRef<HTMLDivElement>(null)
  useEffect(() => { const el = phaseScroll.current; if (el) el.scrollLeft = el.scrollWidth }, [e.unlocked, e.coreUnlocked])

  // 1ª visita às Melhorias (na run 1, sempre vinda da morte): a Luz está adormecida — só ela + CTA.
  // Despertá-la revela a Árvore da Luz com uma animação de revival (mostra a Luz voltando à vida).
  if (!e.coreUnlocked) {
    const fromDeath = !!e.summary && !e.summary.win // chegou aqui após morrer → enquadra como "reacender"
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 26, padding: '40px 28px', background: 'rgba(6,8,12,0.9)', backdropFilter: 'blur(7px)', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '70px 34px 0', textAlign: 'center', pointerEvents: 'none' }}>
          <div style={{ font: `300 23px/1.5 ${F}`, color: '#e4e9f1', letterSpacing: '0.01em', textShadow: '0 0 24px rgba(220,228,238,0.2)' }}>{fromDeath ? 'A Luz se apagou no vazio.' : 'A Luz adormeceu no vazio.'}</div>
        </div>

        {/* núcleo adormecido + órbitas */}
        <div style={{ position: 'relative', width: 120, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', filter: 'brightness(0.92)' }}>
          {/* órbitas de partículas — dão vida ao núcleo adormecido */}
          {[0, 1].map(o => (
            <div key={o} style={{ position: 'absolute', left: '50%', top: '50%', width: o ? 152 : 104, height: o ? 152 : 104, transform: 'translate(-50%,-50%)', animation: `orbit ${o ? 11 : 7}s linear ${o ? '-3s' : '0s'} infinite` }}>
              <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translate(-50%,-50%)', width: o ? 4 : 5, height: o ? 4 : 5, borderRadius: '50%', background: '#ffe6b0', boxShadow: '0 0 8px rgba(255,230,176,0.9)' }} />
            </div>
          ))}
          <div style={{ position: 'absolute', left: '50%', top: '50%', width: 200, height: 200, transform: 'translate(-50%,-50%)', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,236,190,0.3), rgba(255,230,176,0.05) 50%, rgba(255,230,176,0) 72%)', animation: 'lumenBreath 3.2s ease-in-out infinite' }} />
          <div style={{ position: 'absolute', left: '50%', top: '50%', width: 96, height: 96, transform: 'translate(-50%,-50%)', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,249,228,0.8), rgba(255,232,182,0.25) 52%, rgba(255,230,176,0) 76%)' }} />
          {/* herói adormecido (cintila de leve até despertar) */}
          <img src={`${import.meta.env.BASE_URL}hero.png`} alt="" draggable={false} style={{ position: 'relative', width: 42, height: 'auto', filter: 'drop-shadow(0 0 3px #fffef8) drop-shadow(0 0 8px rgba(255,240,200,0.95)) drop-shadow(0 0 18px rgba(255,224,160,0.85)) drop-shadow(0 0 32px rgba(255,208,130,0.55))', animation: 'dormantFlicker 2.6s ease-in-out infinite' }} />
        </div>

        {/* Visual do gasto: você TEM o selo ❖ → ele flui e vira PODER para a Luz */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginTop: -8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* selo que você possui */}
            <div style={{ width: 46, height: 46, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(140deg, rgba(217,184,255,0.3), rgba(217,184,255,0.05))', border: '1.5px solid rgba(217,184,255,0.6)', boxShadow: '0 0 16px rgba(217,184,255,0.4)', font: `700 22px ${F}`, color: '#ece0ff' }}>❖</div>
            {/* fluxo: do selo (roxo) para a Luz (dourado) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {['#cdb8ff', '#e6cfa8', '#ffe0a0'].map((c, i) => (
                <span key={i} style={{ font: `700 16px ${F}`, lineHeight: 1, color: c, animation: `flowPulse 1.3s ease-in-out ${(i * 0.18).toFixed(2)}s infinite` }}>›</span>
              ))}
            </div>
            {/* a Luz recebendo o poder */}
            <div style={{ width: 46, height: 46, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle, rgba(255,244,210,0.5), rgba(255,230,176,0.12) 60%, rgba(255,230,176,0) 78%)', border: '1.5px solid rgba(255,224,160,0.55)', boxShadow: '0 0 18px rgba(255,224,160,0.45)', animation: 'lvpop 2.4s ease-in-out infinite' }}>
              <span style={{ font: `700 18px ${F}`, color: '#fff3d0', textShadow: '0 0 10px rgba(255,224,160,0.9)' }}>✦</span>
            </div>
          </div>
          <div style={{ font: `600 11px ${F}`, letterSpacing: '0.03em', color: '#b9a6e0' }}>Invista <span style={{ color: '#ece0ff' }}>{e.tokens} ❖</span> para dar mais poder à <span style={{ color: '#ffe0a0' }}>Luz</span></div>
        </div>
        <button onClick={awaken} disabled={e.tokens < 1} style={{ width: '100%', maxWidth: 320, padding: 16, borderRadius: 14, border: 'none', background: e.tokens >= 1 ? '#ffe6b0' : 'rgba(255,255,255,0.07)', color: e.tokens >= 1 ? '#1a1206' : '#8a95a6', font: `700 15px ${F}`, cursor: e.tokens >= 1 ? 'pointer' : 'default', boxShadow: e.tokens >= 1 ? '0 0 34px rgba(255,230,176,0.4)' : 'none' }}>Despertar a Luz · 1 ❖</button>
        <button onClick={e.goTitle} style={{ position: 'absolute', bottom: 22, left: 20, right: 20, padding: 12, borderRadius: 13, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#8a95a6', font: `500 13px ${F}`, cursor: 'pointer' }}>← Início</button>
      </div>
    )
  }

  const inviteForce = e.tokens > 0 && e.unlockedForces.length < 2 // tem selo ❖ e ainda há vaga de força

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: '0 0 16px', background: 'rgba(6,8,12,0.86)', backdropFilter: 'blur(7px)' }}>
      {/* Árvore — ocupa toda a área e passa ATRÁS do cabeçalho translúcido */}
      <div style={{ flex: 1, minHeight: 0, padding: '8px 10px 6px' }}>
        <RadialTree e={e} selected={sel} onSelect={setSel} lastUpgraded={e.lastUpgraded} fromGate={fromGate} />
      </div>

      {/* Aviso de progressão: ganhou selo ❖ → hora de despertar uma força (pulsa; some ao gastar ou ao ter 2 forças) */}
      {inviteForce && (
        <div style={{ position: 'absolute', top: 54, left: 12, right: 12, zIndex: 7, padding: '8px 12px', borderRadius: 12, background: 'linear-gradient(90deg, rgba(217,184,255,0.16), rgba(217,184,255,0.05))', border: '1px solid rgba(217,184,255,0.45)', boxShadow: '0 0 18px rgba(217,184,255,0.25)', font: `600 11px ${F}`, color: '#e8d9ff', textAlign: 'center', pointerEvents: 'none', animation: 'lvpop 2.2s ease-in-out infinite' }}>
          {e.tokens > 1 ? `Você tem ${e.tokens} ❖ — escolha uma Força para liberar` : 'Você ganhou um ❖ Selo — escolha uma Força para liberar'}
        </div>
      )}

      {/* Cabeçalho — overlay compacto, levemente transparente + blur (dá sensação de mais espaço) */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '9px 16px 11px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: 'rgba(6,8,12,0.5)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', borderBottom: '1px solid rgba(255,255,255,0.06)', zIndex: 6, pointerEvents: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <button onClick={e.goTitle} aria-label="Início" title="Início" style={{ flex: 'none', width: 30, height: 30, borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(10,15,24,0.5)', color: '#cfd6e2', font: `600 15px ${F}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' }}>←</button>
          <div style={{ minWidth: 0 }}>
            <div style={{ font: `500 9px ${F}`, letterSpacing: '0.28em', color: '#7f8aa0' }}>ÁRVORE DA LUZ</div>
            <div style={{ font: `300 19px ${F}`, marginTop: 1, letterSpacing: '0.02em' }}>Evolua a luz</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flex: 'none' }}>
          <div style={{ font: `700 24px ${F}`, color: '#ffe6b0', lineHeight: 1, textShadow: '0 0 18px rgba(255,230,176,0.5)' }}>{e.coins} ✦</div>
          {inviteForce
            ? <div style={{ font: `700 11px ${F}`, color: '#1a1026', background: '#d9b8ff', padding: '4px 9px', borderRadius: 9, boxShadow: `0 0 16px ${withA('#d9b8ff', 0.6)}`, animation: 'lvpop 2.2s ease-in-out infinite' }}>{e.tokens} ❖ Liberar força</div>
            : <div style={{ font: `600 13px ${F}`, color: '#d9b8ff' }}>{e.tokens} ❖</div>}
        </div>
      </div>

      {/* Estilo do poder base (variação) — Luz + forças liberadas; vale no jogo e é salvo */}
      <div style={{ padding: '4px 14px 0', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ font: `500 8px ${F}`, letterSpacing: '0.24em', color: '#7f8aa0', width: '100%', textAlign: 'center', marginBottom: 1 }}>ESTILO DO PODER</span>
        {[{ key: 'base', name: 'LUZ', color: BASE.color }, ...e.unlockedForces.map(k => ({ key: k as string, name: PATHS[k].name.toUpperCase(), color: PATHS[k].color }))].map(p => (
          <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ font: `700 9px ${F}`, letterSpacing: '0.08em', color: p.color }}>{p.name}</span>
            <select value={e.variant(p.key)} onChange={ev => e.setVariant(p.key, +ev.target.value)}
              style={{ padding: '4px 6px', borderRadius: 8, border: `1px solid ${withA(p.color, 0.4)}`, background: 'rgba(10,15,24,0.7)', color: '#e8edf4', font: `600 10px ${F}`, cursor: 'pointer' }}>
              {VARIANTS[p.key].map((n, i) => <option key={i} value={i} style={{ background: '#0c1118', color: '#e8edf4' }}>{n}</option>)}
            </select>
          </div>
        ))}
      </div>

      {/* Footer — só fases/jogar (o voltar foi para o topo, antes do título) */}
      <div style={{ padding: '6px 16px 0' }}>
        {e.unlocked > 1 ? (
          <div ref={phaseScroll} style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
            <div style={{ flex: 1, minWidth: 0 }} />{/* espaçador: empurra as fases p/ a DIREITA quando cabem; encolhe ao rolar */}
            {MAPS.slice(0, e.unlocked).map((m, i) => {
              const latest = i === e.unlocked - 1 // fase mais recente: maior + amarela, à direita
              return (
                <button key={m.id} onClick={() => e.selectMap(i)} style={{ flex: 'none', minWidth: latest ? 152 : 86, padding: latest ? '12px 16px' : '9px 12px', borderRadius: 13, cursor: 'pointer', textAlign: 'left', border: latest ? 'none' : `1px solid ${withA(m.palette.accent, 0.3)}`, background: latest ? '#ffe6b0' : 'rgba(255,255,255,0.04)', color: latest ? '#1a1206' : '#cfd6e2', opacity: latest ? 1 : 0.72, boxShadow: latest ? '0 0 24px rgba(255,230,176,0.32)' : 'none' }}>
                  <div style={{ font: `700 ${latest ? 14 : 12}px ${F}`, whiteSpace: 'nowrap' }}>Fase {i + 1}{latest ? ' →' : ''}</div>
                  <div style={{ font: `400 ${latest ? 11 : 9.5}px ${F}`, opacity: 0.8, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: latest ? 158 : 88 }}>{m.name}</div>
                </button>
              )
            })}
          </div>
        ) : (
          <button onClick={e.playMap1} style={{ ...primaryBtn, width: '100%' }}>Jogar — Mapa 1 →</button>
        )}
      </div>
    </div>
  )
}

// ---------- Death (menu abaixo do feixe, sem cobrir a tela) ----------
function DeathScreen({ e }: { e: Engine }) {
  const sm = e.summary!
  return (
   <>
    {/* frase da derrota no topo */}
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '64px 28px 0', textAlign: 'center', pointerEvents: 'none' }}>
      <div style={{ font: `500 11px ${F}`, letterSpacing: '0.34em', color: '#7f8aa0', marginBottom: 12 }}>A LUZ SE ESVAI</div>
      <div style={{ font: `300 23px ${F}`, color: '#dfe5ee', lineHeight: 1.35, letterSpacing: '0.01em', textShadow: '0 0 24px rgba(220,228,238,0.18)' }}>{e.deathLine}</div>
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '60px 22px 26px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, background: 'linear-gradient(to top, rgba(6,8,12,0.92) 40%, rgba(6,8,12,0))' }}>
      {/* dados em segundo plano, menores */}
      <div style={{ textAlign: 'center', opacity: 0.5 }}>
        <div style={{ font: `500 10px ${F}`, letterSpacing: '0.3em', color: '#7f8aa0' }}>O VAZIO AVANÇOU</div>
        <div style={{ font: `400 12px ${F}`, color: '#9aa9bd', marginTop: 5 }}>
          Onda {sm.wave}/{sm.waves} · {sm.kills} dissipadas · {sm.time}
        </div>
      </div>
      {/* 2 botões lado a lado — destaque para Melhorias */}
      <div style={{ display: 'flex', gap: 11, width: '100%', maxWidth: 360 }}>
        <button onClick={e.goPoderes} style={{ flex: 1.5, padding: '13px 14px', borderRadius: 13, border: 'none', background: '#ffe6b0', color: '#1a1206', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, boxShadow: '0 0 30px rgba(255,230,176,0.3)' }}>
          <span style={{ font: `600 14px ${F}` }}>Melhorias</span>
          <span style={{ font: `700 16px ${F}` }}>{e.coins} ✦</span>
        </button>
        <button onClick={e.retry} style={{ flex: 1, padding: 13, borderRadius: 13, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.04)', color: '#e8edf4', font: `500 14px ${F}`, cursor: 'pointer' }}>Tentar de novo</button>
      </div>
    </div>
   </>
  )
}

// ---------- Victory (bioma libertado — mesmo layout da derrota, em luz plena) ----------
function End({ e }: { e: Engine }) {
  const sm = e.summary!
  // FIM DE JOGO: venceu o Coração do Vazio (última fase) → tela de encerramento (não "Nova Fase").
  if (sm.final) {
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 30px', gap: 16, background: 'radial-gradient(circle at 50% 38%, rgba(250,246,236,0.92), rgba(247,243,233,0.97))' }}>
        <div style={{ font: `600 11px ${F}`, letterSpacing: '0.42em', color: '#a08a4e' }}>O VAZIO FOI VENCIDO</div>
        <div style={{ font: `300 50px ${F}`, color: '#14161c', lineHeight: 1, letterSpacing: '0.02em', textShadow: '0 0 30px rgba(255,220,150,0.4)' }}>A Luz Triunfou</div>
        <div style={{ font: `400 14px ${F}`, color: '#5a5340', maxWidth: 300, lineHeight: 1.55 }}>O Coração do Vazio se dissolveu. A Luz que você cultivou preencheu cada recanto da escuridão.</div>
        <div style={{ font: `400 12px ${F}`, color: '#7a6f54', marginTop: 4, opacity: 0.85 }}>{sm.kills} dissipadas · {sm.time} · {sm.waves} ondas</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11, width: '100%', maxWidth: 320, marginTop: 16 }}>
          <button onClick={e.goTitle} style={{ ...primaryBtn }}>Voltar ao Início</button>
          <button onClick={e.retry} style={{ padding: 14, borderRadius: 13, border: '1px solid rgba(28,31,38,0.22)', background: 'transparent', color: '#3a3528', font: `500 14px ${F}`, cursor: 'pointer' }}>Enfrentar o Vazio de novo</button>
        </div>
      </div>
    )
  }
  return (
   <>
    {/* topo: Vitória grande + selo de poder à frente */}
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '60px 28px 0', textAlign: 'center', pointerEvents: 'none' }}>
      <div style={{ font: `600 11px ${F}`, letterSpacing: '0.34em', color: '#a08a4e', marginBottom: 10 }}>BIOMA LIBERTADO</div>
      <div style={{ font: `300 42px ${F}`, color: '#14161c', letterSpacing: '0.02em', lineHeight: 1 }}>Vitória</div>
      <div style={{ font: `400 13px ${F}`, color: '#5a5340', margin: '12px auto 0', maxWidth: 280, lineHeight: 1.5 }}>A luz libertou este bioma do Vazio. O próximo aguarda.</div>
    </div>
    {/* +1 Selo gigante no centro */}
    {sm.selo && (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', gap: 2 }}>
        <div style={{ font: `700 96px ${F}`, color: '#caa24a', lineHeight: 1, textShadow: '0 0 36px rgba(200,160,70,0.45)' }}>+1</div>
        <div style={{ font: `700 17px ${F}`, letterSpacing: '0.22em', color: '#8a6e2a' }}>❖ SELO DE PODER</div>
        <div style={{ font: `400 12px ${F}`, color: '#7a6f54', marginTop: 6, maxWidth: 240, textAlign: 'center', lineHeight: 1.4 }}>Use em Melhorias para liberar uma nova força.</div>
      </div>
    )}
    {/* base: dados em segundo plano + CTAs */}
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '60px 22px 26px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, background: 'linear-gradient(to top, rgba(247,243,233,0.94) 42%, rgba(247,243,233,0))' }}>
      <div style={{ textAlign: 'center', opacity: 0.6 }}>
        <div style={{ font: `600 10px ${F}`, letterSpacing: '0.3em', color: '#9a875a' }}>A LUZ VENCEU</div>
        <div style={{ font: `400 12px ${F}`, color: '#6b6552', marginTop: 5 }}>
          Onda {sm.waves}/{sm.waves} · {sm.kills} dissipadas · {sm.time}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 11, width: '100%', maxWidth: 360 }}>
        <button onClick={e.goPoderes} style={{ flex: 1.5, padding: '13px 14px', borderRadius: 13, border: 'none', background: '#ffe0a0', color: '#1a1206', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, boxShadow: '0 0 24px rgba(220,180,90,0.4)' }}>
          <span style={{ font: `600 14px ${F}` }}>Melhorias</span>
          <span style={{ font: `700 16px ${F}` }}>{e.coins} ✦</span>
        </button>
        <button onClick={e.nextPhase} style={{ flex: 1, padding: 13, borderRadius: 13, border: '1px solid rgba(28,31,38,0.2)', background: 'rgba(28,31,38,0.06)', color: '#1c1f26', font: `600 14px ${F}`, cursor: 'pointer' }}>Nova Fase →</button>
      </div>
    </div>
   </>
  )
}
