# deck.gl 9.x - Animated Particle Layer

This is a minimum example of an animated particle layer for deck.gl versions 9.1 and up.

## Run locally

1. `npm install`
2. `npm run start`

Vite will open the demo in your browser (or open the URL it prints, typically `http://localhost:5173/demo/deck-particle-layer/`).

There's a [demo on my website](https://az.id.au/demo/deck-particle-layer/) where you'll also find a [tutorial and write up](https://az.id.au/dev/wind-particle-layer-in-deckgl-9.x/) on how to modify an animated particle layer built for older versions of [deck.gl](https://deck.gl) or [luma.gl](https://luma.gl/) (such as the 8.x era).

The particle layer needs a wind raster image (RGBA) where the `R` and `G` channels encode the wind vector; update `outputImg` in `app.tsx` to point to your data source (the project includes a sample raster at `public/img/2025-05-04-wind-layer-input.png`).
