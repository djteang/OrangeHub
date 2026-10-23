import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  server: { port: 4173, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true },
});
