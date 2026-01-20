import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // 🔥 GitHub Pages 프로젝트 경로
  base: "/HDC/",

  plugins: [react()],

  // 🔥 React 중복 로딩 / external 꼬임 방지
  resolve: {
    dedupe: ["react", "react-dom"],
  },

  build: {
    // GitHub Pages에서 경로 꼬임 방지
    assetsDir: "assets",

    rollupOptions: {
      // react가 external로 빠지는 사고 방지
      external: [],
    },
  },

  // dev 서버용 (Pages에는 영향 없음)
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
