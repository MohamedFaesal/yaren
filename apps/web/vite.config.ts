import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const apiOrigin = process.env.VITE_API_ORIGIN ?? "http://127.0.0.1:3000";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    port: 5173,
    proxy: {
      "/api": apiOrigin,
      "/uploads": apiOrigin,
    },
  },
});
