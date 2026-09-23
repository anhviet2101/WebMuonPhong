import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
  resolve: {
    alias: {
      "@/components/shared": `${import.meta.dirname}/components/shared`,
      "@/components/dashboard": `${import.meta.dirname}/components/dashboard`,
      "@/components/calendar": `${import.meta.dirname}/components/calendar`,
      "@/components/auth": `${import.meta.dirname}/components/auth`,
      "@": `${import.meta.dirname}/src`,
    },
  },
});
