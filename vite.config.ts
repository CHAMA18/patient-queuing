import { defineConfig } from "vite";

const apiProxy = {
  "/api/": {
    target: `http://127.0.0.1:${process.env.API_PORT ?? "3001"}`,
    changeOrigin: true,
  },
};

export default defineConfig({
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
});
