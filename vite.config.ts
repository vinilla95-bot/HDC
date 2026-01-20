import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/HDC/",
  plugins: [react()],

  // ✅ GitHub Pages + 번들러 꼬임 방지용 “React 중복/외부화” 방어
  resolve: {
    dedupe: ["react", "react-dom"],
  },

  build: {
    rollupOptions: {
      // ✅ 혹시 어디선가 react를 external로 빼는 걸 막기
      external: [],
    },
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
