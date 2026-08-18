import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import autoprefixer from 'autoprefixer'

const srcDir = fileURLToPath(new URL('./src', import.meta.url))
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000

export default defineConfig(() => {
  return {
    base: '/',
    build: {
      outDir: 'build',
    },
    css: {
      postcss: {
        plugins: [
          autoprefixer({}), // add options if needed
        ],
      },
    },
    plugins: [react()],
    resolve: {
      alias: [
        {
          find: 'src/',
          replacement: `${srcDir}/`,
        },
      ],
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.scss'],
    },
    server: {
      host: '0.0.0.0',
      port: port,
    },
    preview: {
      host: '0.0.0.0',
      port: port,
      allowedHosts: true,
    },
  }
})

