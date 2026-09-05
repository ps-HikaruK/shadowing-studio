import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./app/App";
import "./index.css";

async function boot() {
  if (import.meta.env.DEV) {
    // preview/本番ビルドの Service Worker が残っていると、Vite ではなく古い JS が動き、
    // TTS が GAS へ直接 POST → CORS で「ネットワークエラー」になる
    const reloaded = await clearDevServiceWorkers();
    if (reloaded) return;
  } else {
    registerSW({ immediate: true });
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

async function clearDevServiceWorkers(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  const hadController = Boolean(navigator.serviceWorker.controller);
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map((r) => r.unregister()));
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
  if (!hadController && regs.length === 0) return false;
  const flag = "shadowing-studio:sw-cleared";
  if (sessionStorage.getItem(flag)) return false;
  sessionStorage.setItem(flag, "1");
  window.location.reload();
  return true;
}

void boot();
