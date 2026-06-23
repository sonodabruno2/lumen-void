/**
 * Lumen Void — áudio procedural via Web Audio API.
 * Sem arquivos externos. Inicializa lazy após interação do usuário.
 */

type SoundId =
  | 'shoot_basic'
  | 'shoot_storm'
  | 'shoot_volcano'
  | 'shoot_frost'
  | 'shoot_terra'
  | 'hit'
  | 'kill'
  | 'core_hit'
  | 'wave_start'
  | 'coin'
  | 'victory'
  | 'defeat'
  | 'heal'
  | 'upgrade'

class AudioManager {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  muted = false

  private getCtx(): AudioContext | null {
    if (this.muted) return null
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext()
        this.master = this.ctx.createGain()
        this.master.gain.value = 0.55
        this.master.connect(this.ctx.destination)
      } catch {
        return null
      }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume()
    return this.ctx
  }

  private out(_ctx: AudioContext): AudioNode {
    return this.master!
  }

  // ---------- building blocks ----------

  private osc(ctx: AudioContext, type: OscillatorType, freq: number, startT: number, endFreq: number, dur: number, gain: number, freqCurve = 'exp'): void {
    const g = ctx.createGain()
    g.connect(this.out(ctx))
    g.gain.setValueAtTime(gain, startT)
    g.gain.exponentialRampToValueAtTime(0.0001, startT + dur)

    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(freq, startT)
    if (freqCurve === 'exp') {
      o.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), startT + dur)
    } else {
      o.frequency.linearRampToValueAtTime(endFreq, startT + dur)
    }
    o.connect(g)
    o.start(startT)
    o.stop(startT + dur + 0.01)
  }

  private noise(ctx: AudioContext, dur: number, startT: number, gain: number, filterFreq = 2000, filterQ = 1): void {
    const bufSize = ctx.sampleRate * Math.min(dur, 1)
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1

    const src = ctx.createBufferSource()
    src.buffer = buf

    const filt = ctx.createBiquadFilter()
    filt.type = 'bandpass'
    filt.frequency.value = filterFreq
    filt.Q.value = filterQ

    const g = ctx.createGain()
    g.gain.setValueAtTime(gain, startT)
    g.gain.exponentialRampToValueAtTime(0.0001, startT + dur)

    src.connect(filt)
    filt.connect(g)
    g.connect(this.out(ctx))
    src.start(startT)
    src.stop(startT + dur + 0.01)
  }

  // ---------- sons ----------

  private sounds: Record<SoundId, (ctx: AudioContext, t: number) => void> = {
    shoot_basic: (ctx, t) => {
      // laser curto agudo
      this.osc(ctx, 'sine', 1400, t, 420, 0.07, 0.18)
      this.osc(ctx, 'sine', 900, t, 200, 0.07, 0.06)
    },

    shoot_storm: (ctx, t) => {
      // crackle elétrico — ruído + tono agudo
      this.noise(ctx, 0.12, t, 0.25, 3000, 4)
      this.osc(ctx, 'sawtooth', 880, t, 2200, 0.1, 0.08)
    },

    shoot_volcano: (ctx, t) => {
      // woosh grave + fogo
      this.osc(ctx, 'sawtooth', 180, t, 60, 0.35, 0.22)
      this.noise(ctx, 0.3, t, 0.18, 600, 1)
    },

    shoot_frost: (ctx, t) => {
      // ping cristalino
      this.osc(ctx, 'sine', 1800, t, 600, 0.28, 0.2)
      this.osc(ctx, 'sine', 2400, t, 800, 0.18, 0.08)
    },

    shoot_terra: (ctx, t) => {
      // baque sísmico
      this.osc(ctx, 'sine', 80, t, 30, 0.32, 0.55)
      this.noise(ctx, 0.28, t, 0.22, 300, 0.8)
    },

    hit: (ctx, t) => {
      // tick rápido
      this.osc(ctx, 'square', 600, t, 200, 0.055, 0.12)
    },

    kill: (ctx, t) => {
      // pop + chiado de dissolução
      this.osc(ctx, 'sine', 320, t, 80, 0.12, 0.25)
      this.noise(ctx, 0.1, t, 0.14, 1400, 2)
    },

    core_hit: (ctx, t) => {
      // impacto grave + tremor
      this.osc(ctx, 'sine', 55, t, 30, 0.4, 0.7)
      this.osc(ctx, 'sawtooth', 110, t, 40, 0.25, 0.3)
      this.noise(ctx, 0.35, t, 0.3, 400, 0.8)
    },

    wave_start: (ctx, t) => {
      // swoosh + nota ascendente de impacto
      this.osc(ctx, 'sine', 300, t, 900, 0.28, 0.45)
      this.osc(ctx, 'sine', 600, t + 0.12, 1200, 0.22, 0.4)
      this.noise(ctx, 0.5, t, 0.2, 1200, 1.5)
    },

    coin: (ctx, t) => {
      // sparkle ding duplo
      this.osc(ctx, 'sine', 1200, t, 1600, 0.1, 0.15)
      this.osc(ctx, 'sine', 1600, t + 0.06, 2000, 0.08, 0.12)
    },

    victory: (ctx, t) => {
      // fanfarra curta (3 notas ascendentes)
      const notes = [523, 659, 784, 1047]
      notes.forEach((freq, i) => {
        this.osc(ctx, 'sine', freq, t + i * 0.13, freq * 0.95, 0.28, 0.32)
        this.osc(ctx, 'triangle', freq * 1.5, t + i * 0.13, freq * 1.4, 0.22, 0.1)
      })
    },

    defeat: (ctx, t) => {
      // descida melancólica
      const notes = [440, 370, 311, 220]
      notes.forEach((freq, i) => {
        this.osc(ctx, 'sine', freq, t + i * 0.22, freq * 0.8, 0.38, 0.25)
      })
      this.noise(ctx, 1.0, t + 0.3, 0.12, 200, 0.5)
    },

    heal: (ctx, t) => {
      // toque suave ascendente
      this.osc(ctx, 'sine', 660, t, 880, 0.18, 0.22)
      this.osc(ctx, 'sine', 990, t + 0.05, 1320, 0.12, 0.18)
    },

    upgrade: (ctx, t) => {
      // compra de melhoria — arpejo brilhante ascendente + sparkle satisfatório
      const notes = [523, 784, 1047] // dó, sol, dó (oitava)
      notes.forEach((freq, i) => {
        this.osc(ctx, 'triangle', freq, t + i * 0.05, freq * 1.02, 0.2, 0.26)
        this.osc(ctx, 'sine', freq * 2, t + i * 0.05, freq * 2, 0.14, 0.1)
      })
      // brilho final
      this.osc(ctx, 'sine', 2093, t + 0.15, 2600, 0.18, 0.16)
      this.noise(ctx, 0.18, t + 0.12, 0.08, 4000, 3)
    },
  }

  play(id: SoundId) {
    const ctx = this.getCtx()
    if (!ctx) return
    const t = ctx.currentTime + 0.005
    try { this.sounds[id](ctx, t) } catch { /* ignore */ }
  }

  toggleMute() {
    this.muted = !this.muted
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55
    return this.muted
  }
}

export const audio = new AudioManager()
