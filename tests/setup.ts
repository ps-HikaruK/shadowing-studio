import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { Blob as NodeBlob } from "node:buffer";
import { webcrypto } from "node:crypto";

// jsdom の Blob は structuredClone(IndexedDB 保存)後に arrayBuffer() を失うため、Node の Blob を使う
Object.defineProperty(globalThis, "Blob", { value: NodeBlob, configurable: true, writable: true });

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
}
