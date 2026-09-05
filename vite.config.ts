/// <reference types="vitest/config" />
import { fileURLToPath, URL } from "node:url";
import type { Connect, Plugin } from "vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const TTS_PROXY_PATH = "/__tts_proxy";

function isAllowedGasUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "script.google.com" &&
      parsed.pathname.includes("/macros/") &&
      /\/exec\/?$/.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

function requestPath(req: Connect.IncomingMessage): string {
  const raw = req.originalUrl ?? req.url ?? "";
  try {
    if (raw.startsWith("http://") || raw.startsWith("https://")) return new URL(raw).pathname;
  } catch {
    /* fall through */
  }
  return raw.split("?")[0] ?? "";
}

function extractTarget(headerValue: string | undefined, body: Buffer): string {
  const fromHeader = headerValue?.trim() ?? "";
  if (fromHeader) return fromHeader;
  try {
    const parsed = JSON.parse(body.toString("utf8")) as { proxyTarget?: unknown };
    return typeof parsed.proxyTarget === "string" ? parsed.proxyTarget.trim() : "";
  } catch {
    return "";
  }
}

async function readBody(req: Connect.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** GAS は 302 のあと GET で結果を返す。Node fetch の自動追従が POST のままになるのを防ぐ。 */
async function postToGas(target: string, body: Buffer): Promise<{ status: number; text: string }> {
  let response = await fetch(target, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body,
    redirect: "manual",
  });

  for (let hop = 0; hop < 5; hop++) {
    if (response.status < 300 || response.status >= 400) break;
    const location = response.headers.get("location");
    if (!location) break;
    await response.arrayBuffer();
    response = await fetch(new URL(location, target), {
      method: "GET",
      redirect: "manual",
    });
  }

  return { status: response.status, text: await response.text() };
}

/** 以前の `vite preview` が残した本番 SW を、次の更新で自己解除させる */
const DESTROY_SW = `/* shadowing-studio: retire leftover production SW on localhost */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("navigate" in client) await client.navigate(client.url);
    }
  })());
});
`;

function isServiceWorkerRequest(path: string): boolean {
  return path === "/sw.js" || path === "/registerSW.js" || /^\/workbox-[a-zA-Z0-9_-]+\.js$/.test(path);
}

/**
 * 開発時: ブラウザ→GAS の CORS/302 を避けるため、Vite が script.google.com へ中継する。
 */
function gasTtsProxy(): Plugin {
  const handler: Connect.NextHandleFunction = async (req, res, next) => {
    if (requestPath(req) !== TTS_PROXY_PATH) {
      next();
      return;
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");

    if (req.method === "GET" || req.method === "HEAD") {
      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true, service: "vite-gas-tts-proxy" }));
      return;
    }

    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end(JSON.stringify({ ok: false, code: "bad_request", error: "POST only" }));
      return;
    }

    const header = req.headers["x-tts-proxy-target"];
    const headerValue = Array.isArray(header) ? header[0] : header;
    try {
      const body = await readBody(req);
      const target = extractTarget(headerValue, body);
      if (!target || !isAllowedGasUrl(target)) {
        res.statusCode = 400;
        res.end(
          JSON.stringify({
            ok: false,
            code: "bad_request",
            error:
              "Web App URL が不正です。Apps Script の「デプロイ」画面にある https://script.google.com/macros/s/…/exec を設定してください（ブラウザで開いた先の googleusercontent の URL は使えません）",
          }),
        );
        return;
      }

      const upstream = await postToGas(target, body);
      console.info(`[tts-proxy] ${target.slice(0, 64)}… HTTP ${upstream.status}`);
      if (upstream.status === 401 || upstream.status === 403) {
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            ok: false,
            code: "auth_required",
            error:
              "GAS web app requires login. Redeploy with access = Anyone (anonymous), then update the Web App URL.",
          }),
        );
        return;
      }
      // HTML が返ってきた場合も JSON エラーに正規化する
      const trimmed = upstream.text.trim();
      if (trimmed.startsWith("<") || !trimmed.startsWith("{")) {
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            ok: false,
            code: "server",
            error: `Non-JSON response from GAS (HTTP ${upstream.status}): ${trimmed.slice(0, 180)}`,
          }),
        );
        return;
      }
      res.statusCode = upstream.status;
      res.end(upstream.text);
    } catch (err) {
      res.statusCode = 502;
      res.end(
        JSON.stringify({
          ok: false,
          code: "network",
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  };

  return {
    name: "gas-tts-proxy",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method === "GET" && isServiceWorkerRequest(requestPath(req))) {
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/javascript; charset=utf-8");
          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
          res.end(DESTROY_SW);
          return;
        }
        next();
      });
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig({
  // GitHub Pages ではリポジトリ名配下に配置されるため、環境変数で base を差し替える
  base: process.env.VITE_BASE_PATH ?? "/",
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    headers: { "Cache-Control": "no-store" },
  },
  plugins: [
    gasTtsProxy(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      includeAssets: ["icons/*.svg", "icons/*.png"],
      manifest: {
        name: "Shadowing Studio",
        short_name: "Shadowing",
        description:
          "ChatGPTで作った英会話スクリプトを、自然な男性AI音声のシャドーイング教材へ変換する個人用アプリ",
        lang: "ja",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        orientation: "portrait",
        start_url: ".",
        scope: ".",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        navigateFallback: "index.html",
        // TTS プロキシへのリクエストは Service Worker でキャッシュしない(音声は IndexedDB に保存する)
        runtimeCaching: [],
        navigateFallbackDenylist: [/^\/__tts_proxy/],
      },
    }),
  ],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
  },
});
