import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command, mode }) => {
  // A build without the sign-in Worker's URL ships a site where sign-in only shows "VITE_AUTH_URL is not set".
  if (command === "build" && !loadEnv(mode, ".", "VITE_").VITE_AUTH_URL)
    throw new Error("VITE_AUTH_URL is not set for this build (see .env.production).");
  return {
    plugins: [react()],
    server: { port: 5180, strictPort: true }, // 5173 is taken by another local app
  };
});
