import { create } from "zustand";

interface ConfirmRequest {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

interface ConfirmState {
  current: ConfirmRequest | null;
  open: (req: Omit<ConfirmRequest, "resolve">) => Promise<boolean>;
  close: (ok: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>()((set, get) => ({
  current: null,
  open: (req) =>
    new Promise<boolean>((resolve) => {
      set({ current: { ...req, resolve } });
    }),
  close: (ok) => {
    get().current?.resolve(ok);
    set({ current: null });
  },
}));

export const confirmDialog = (req: Omit<ConfirmRequest, "resolve">) => useConfirmStore.getState().open(req);

export function ConfirmDialogHost() {
  const current = useConfirmStore((s) => s.current);
  const close = useConfirmStore((s) => s.close);
  if (!current) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="card w-full max-w-sm">
        <h2 className="text-base font-semibold">{current.title}</h2>
        {current.message ? <p className="mt-2 text-sm text-slate-300">{current.message}</p> : null}
        <div className="mt-4 flex gap-2">
          <button className="btn-secondary flex-1" onClick={() => close(false)}>
            キャンセル
          </button>
          <button
            className={`${current.danger ? "btn-danger" : "btn-primary"} flex-1`}
            onClick={() => close(true)}
          >
            {current.confirmLabel ?? "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
