import path from "path";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import viteReact from "@vitejs/plugin-react";

/**
 * Standalone SPA build for SpaceFast. The TanStack Start (SSR) setup in
 * vite.config.ts is left untouched for the Lovable deployment; this config
 * builds the static single-page app served from the preview space.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  plugins: [tsConfigPaths({ projects: ["./tsconfig.json"] }), viteReact()],
  build: {
    outDir: "dist-spa",
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, "spa.html"),
    },
  },
});
