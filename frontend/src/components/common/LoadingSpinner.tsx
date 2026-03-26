interface LoadingSpinnerProps {
  label?: string;
}

export function LoadingSpinner({ label = "Loading" }: LoadingSpinnerProps) {
  return (
    <div className="flex items-center gap-3 text-sm text-ink-600">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-200 border-t-teal-500" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}