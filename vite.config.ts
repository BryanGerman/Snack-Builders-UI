import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = env.VITE_PROXY_TARGET || "http://localhost:8000";
  const endpointProxy = {
    target: proxyTarget,
    changeOrigin: true,
  };

  return {
    plugins: [react()],
    base: env.VITE_GITHUB_PAGES_BASE_PATH || "/",
    server: {
      port: 5173,
      proxy: {
        "/api": {
          ...endpointProxy,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
        "/health": endpointProxy,
        "/menu": endpointProxy,
        "/orders": endpointProxy,
        "/payments": endpointProxy,
        "/kitchen": endpointProxy,
      },
    },
  };
});
