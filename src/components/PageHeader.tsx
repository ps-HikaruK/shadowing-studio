import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { IconBack } from "./Icons";

interface Props {
  title: string;
  backTo?: string;
  onBack?: () => void;
  right?: ReactNode;
  subtitle?: string;
}

export function PageHeader({ title, backTo, onBack, right, subtitle }: Props) {
  const navigate = useNavigate();
  const showBack = backTo !== undefined || onBack !== undefined;
  return (
    <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-2xl items-center gap-2 px-3">
        {showBack ? (
          <button
            className="btn-ghost -ml-1 h-10 w-10 px-0"
            onClick={() => (onBack ? onBack() : backTo ? navigate(backTo) : navigate(-1))}
            aria-label="戻る"
          >
            <IconBack />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold">{title}</h1>
          {subtitle ? <p className="truncate text-xs text-slate-400">{subtitle}</p> : null}
        </div>
        {right}
      </div>
    </header>
  );
}

export function Page({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <main className={`mx-auto w-full max-w-2xl px-4 pb-8 pt-4 ${className}`}>{children}</main>;
}
