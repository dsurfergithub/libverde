/**
 * Rasteriza public/favicon.svg a los PNG que el SVG no cubre.
 * iOS ignora los iconos SVG: sin apple-touch-icon.png, al añadir la PWA a la
 * pantalla de inicio pone una captura de la página en vez del icono.
 *
 *   npm run icons
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const SVG = new URL('../public/favicon.svg', import.meta.url)
const OUT = new URL('../public/icons/', import.meta.url)

const SIZES = [
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  // Maskable: iconos recortados en Android. Necesitan ~20% de margen seguro.
  { file: 'icon-maskable-512.png', size: 512, padding: 0.1 },
]

const svg = await readFile(SVG)
await mkdir(OUT, { recursive: true })

for (const { file, size, padding = 0 } of SIZES) {
  const inner = Math.round(size * (1 - padding * 2))
  const margin = Math.round((size - inner) / 2)

  const icon = await sharp(svg, { density: 400 }).resize(inner, inner).png().toBuffer()

  const canvas = padding
    ? await sharp({
        create: {
          width: size,
          height: size,
          channels: 4,
          background: '#f4ebdb', // el crema de la bandeja: sin bordes raros al recortar
        },
      })
        .composite([{ input: icon, top: margin, left: margin }])
        .png()
        .toBuffer()
    : icon

  await writeFile(new URL(file, OUT), canvas)
  console.log(`✓ icons/${file} (${size}px)`)
}
