import { create } from "zustand";

interface ToastItem {
  id: number;
  message: string;
  kind: "info" | "success" | "error";
}

interface ToastState {
  items: ToastItem[];
  push: (message: string, kind?: ToastItem["kind"]) => void;
  remove: (id: number) => void;
}

let seq = 0;

export const useToastStore = create<ToastState>()((set) => ({
  items: [],
  push: (message, kind = "info") => {
    const id = ++seq;
    set((s) => ({ items: [...s.items, { id, message, kind }] }));
    setTimeout(() => set((s) => ({ items: s.items.filter((t) => t.id !== id) })), 3200);
  },
  remove: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}));

export const toast = {
  info: (m: string) => useToastStore.getState().push(m, "info"),
  success: (m: string) => useToastStore.getState().push(m, "success"),
  error: (m: string) => useToastStore.getState().push(m, "error"),
};

export function ToastHost() {
  const items = useToastStore((s) => s.items);
  const remove = useToastStore((s) => s.remove);
  if (items.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <button
          key={t.id}
          onClick={() => remove(t.id)}
          className={`pointer-events-auto max-w-sm rounded-xl px-4 py-2.5 text-sm shadow-lg ${
            t.kind === "error"
              ? "bg-rose-600 text-white"
              : t.kind === "success"
                ? "bg-emerald-600 text-white"
                : "bg-slate-800 text-slate-100"
          }`}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
