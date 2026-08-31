import path from "node:path"
import { defineConfig } from "vite"
import tailwindcss from '@tailwindcss/vite'

import { generateStaticSeoPages } from "./scripts/generate-static-seo-pages"

export default defineConfig({
  plugins: [
    tailwindcss(),
    {
      name: "formpack-static-seo-pages",
      transformIndexHtml(html: string) {
        const siteUrl = (
          process.env.VITE_SITE_URL ?? "https://formpack.app"
        ).replace(/\/$/, "")
        return html.replaceAll("https://formpack.app", siteUrl)
      },
      writeBundle() {
        generateStaticSeoPages()
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: "es2020",
    sourcemap: true,
  },
})
