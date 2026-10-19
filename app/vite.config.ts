import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { viteSingleFile } from "vite-plugin-singlefile";

// Deux sorties :
//  - production (npm run build)      : application installable (PWA) reliée à Supabase
//  - démonstration (npm run build:demo) : un seul fichier HTML, données fictives en mémoire
export default defineConfig(({ mode }) => {
  const demo = mode === "demo";
  // « / » sur un domaine propre (com.mairie-cabannes.fr) ; « /nom-du-depot/ » sur GitHub Pages sans domaine.
  const env = loadEnv(mode, process.cwd(), "");
  const base = demo ? "./" : (env.VITE_BASE || "/").replace(/\/?$/, "/");
  return {
    base,
    plugins: [
      react(),
      demo
        ? viteSingleFile()
        : VitePWA({
            registerType: "prompt",
            includeAssets: ["icons/*.png", "favicon.svg"],
            manifest: {
              name: "Gestion COM — Commune de Cabannes",
              short_name: "Gestion COM",
              description: "Planification, validation et suivi de la communication municipale",
              lang: "fr",
              start_url: base,
              scope: base,
              display: "standalone",
              orientation: "any",
              background_color: "#F3F5F9",
              theme_color: "#1A3C6E",
              icons: [
                { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
                { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
                { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
              ],
            },
            workbox: {
              // Seule l'application elle-même est mise en cache. Les données passent toujours par le
              // réseau (aucune donnée de la commune n'est stockée par le service worker).
              globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
              navigateFallback: `${base}index.html`,
              cleanupOutdatedCaches: true,
            },
          }),
    ],
    build: demo
      ? { outDir: "dist-demo", assetsInlineLimit: 100_000_000, cssCodeSplit: false }
      : { outDir: "dist", sourcemap: false },
    define: { __MODE_DEMO__: JSON.stringify(demo) },
    resolve: demo ? { alias: { "virtual:pwa-register": "/src/pwa-stub.ts" } } : undefined,
  };
});
