import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/HDC/",
  plugins: [react()],

  build: {
    sourcemap: true,
    minify: false,
  },

  server: {
    proxy: {
      "/gas": {
        target: "https://script.google.com",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/gas/, ""),
      },
    },
  },
});
