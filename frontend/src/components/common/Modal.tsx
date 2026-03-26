import { X } from "lucide-react";
import type { ReactNode } from "react";

interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ open, title, description, onClose, children }: ModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/45 p-4 backdrop-blur-sm">
      <div className="panel-surface relative w-full max-w-2xl overflow-hidden p-6 sm:p-8">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full border border-ink-200 bg-white p-2 text-ink-500 transition hover:border-ink-400 hover:text-ink-900"
          aria-label="Close modal"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="pr-8">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-teal-500">Project setup</p>
          <h2 className="mt-3 text-2xl font-semibold text-ink-900">{title}</h2>
          {description ? <p className="mt-2 text-sm leading-7 text-ink-600">{description}</p> : null}
        </div>
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}