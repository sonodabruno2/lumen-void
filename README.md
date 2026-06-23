# Lumen Void

> Um núcleo de luz resiste ao vazio. Sobreviva, derrote os chefes e desperte as forças da natureza.

Jogo arcade de sobrevivência em canvas — um núcleo de luz flutua sobre um pilar e defende-se de ondas do Vazio, evoluindo poderes e despertando forças elementais (Tempestade, Floresta, Gelo, Terra, Vulcão).

## Tecnologias

- **React 18** + **TypeScript**
- **Vite 6** (dev server + build)
- **PWA** (`vite-plugin-pwa`) — instalável, orientação retrato
- Renderização do jogo em **Canvas 2D** (`src/game/engine.ts`)

## Rodando localmente

Pré-requisito: Node.js 18+.

```bash
npm install
npm run dev
```

O servidor de desenvolvimento sobe em `http://localhost:5173/` (ou a porta que você passar: `npm run dev -- --port 5181`).

## Build de produção

```bash
npm run build      # type-check + bundle em dist/
npm run preview    # serve o build localmente
```

## Estrutura

```
src/
  main.tsx          # bootstrap React
  ui/App.tsx        # telas (título, jogo, árvore de poderes, vitória/derrota)
  game/
    engine.ts       # motor do jogo: loop, câmera, render, inimigos, FX
    data.ts         # mapas, forças e árvore de upgrades
    audio.ts        # áudio
    types.ts        # tipos compartilhados
public/             # sprites (hero.png, fase1.png) e ícones do PWA
```
