import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const apiOrigin = process.env.VITE_API_ORIGIN ?? "http://127.0.0.1:3000";

function scannerBridge(): Plugin {
  let child: ChildProcess | null = null;
  return {
    name: "yaren-scanner-bridge",
    configureServer() {
      child = spawn(process.execPath, [fileURLToPath(new URL("./scanner/bridge.mjs", import.meta.url))], {
        stdio: "inherit",
      });
      return () => {
        child?.kill();
        child = null;
      };
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), react(), scannerBridge()],
  server: {
    port: 5173,
    proxy: {
      "/api": apiOrigin,
      "/uploads": apiOrigin,
    },
  },
});
