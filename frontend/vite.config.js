const { defineConfig } = require("vite");
const path = require("node:path");

module.exports = defineConfig({
  root: __dirname,
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": process.env.API_URL || "http://127.0.0.1:3001" }
  },
  build: { outDir: path.join(__dirname, "dist"), emptyOutDir: true }
});
