import { useState } from "react";
import { AlertTriangle } from "lucide-react";

interface ConfirmDeleteDialogProps {
  open: boolean;
  title: string;
  itemName: string;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting?: boolean;
}

export function ConfirmDeleteDialog({
  open,
  title,
  itemName,
  onClose,
  onConfirm,
  isDeleting = false,
}: ConfirmDeleteDialogProps) {
  const [confirmText, setConfirmText] = useState("");
  const isConfirmed = confirmText.trim().toLowerCase() === "delete";

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/45 p-4 backdrop-blur-sm">
      <div className="panel-surface relative w-full max-w-md overflow-hidden p-6 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100/50">
            <AlertTriangle className="h-6 w-6 text-red-600" />
          </div>
          
          <h2 className="text-xl font-semibold text-ink-900">{title}</h2>
          
          <p className="mt-3 text-sm text-ink-600">
            This action cannot be undone. This will permanently delete <strong>{itemName}</strong> and all of its associated data.
          </p>

          <div className="mt-6 w-full text-left">
            <label htmlFor="confirm-delete" className="block text-sm font-medium text-ink-700">
              Please type <span className="font-bold select-all">delete</span> to confirm.
            </label>
            <input
              type="text"
              id="confirm-delete"
              className="mt-2 block w-full rounded-md border-ink-200 shadow-sm focus:border-red-500 focus:ring-red-500 sm:text-sm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="delete"
              autoComplete="off"
            />
          </div>

          <div className="mt-8 flex w-full gap-3 sm:flex-row-reverse">
            <button
              type="button"
              className="btn flex-1 bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed"
              onClick={onConfirm}
              disabled={!isConfirmed || isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete forever"}
            </button>
            <button
              type="button"
              className="btn flex-1 border border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
              onClick={onClose}
              disabled={isDeleting}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
