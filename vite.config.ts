import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // GitHub Pages project path
  base: "/HDC/",

  plugins: [react()],

  // Force a single React instance (prevents hooks from breaking)
  resolve: {
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ],
    // Helps avoid weird module resolution in some setups
    preserveSymlinks: false,
    conditions: ["browser", "module", "default"],
  },

  // Make sure Vite pre-bundles the same React deps consistently
  optimizeDeps: {
    include: ["react", "react-dom", "react/jsx-runtime"],
  },

  build: {
    assetsDir: "assets",

    rollupOptions: {
      // Do NOT externalize react/react-dom
      external: [],
      output: {
        // Ensure no accidental global name expectations
        globals: {},
      },
    },
  },

  // Dev server proxy only
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
