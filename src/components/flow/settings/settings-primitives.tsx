import { cn } from "@/lib/utils";

/** One input style for every field in Settings — quiet, bordered, 13px. */
export const fieldClass =
  "w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-[13px] leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-ring";

/** A labelled field: tiny sentence-case label, control underneath. */
export function SettingsField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

/** The one-paragraph explanation under a section title. */
export function SettingsHint({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] leading-relaxed text-muted-foreground">{children}</p>;
}

/** A settings row: label on the left, control on the right, wraps on mobile. */
export function SettingsRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-1">
      <div className="min-w-0">
        <p className="truncate text-[13px] text-foreground">{label}</p>
        {description && <p className="text-[11px] text-muted-foreground">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** Segmented choices: the only control shape used for enum settings. */
export function SettingsChoices<T extends string>({
  value,
  options,
  onSelect,
}: {
  value: T;
  options: Array<{ label: string; value: T }>;
  onSelect: (value: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap items-center gap-0.5 rounded-md bg-elevated p-0.5">
      {options.map((option) => (
        <button
          key={option.label}
          type="button"
          onClick={() => onSelect(option.value)}
          aria-pressed={option.value === value}
          className={cn(
            "rounded-[5px] px-2.5 py-1 text-[12px] transition-colors",
            option.value === value
              ? "bg-surface text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
