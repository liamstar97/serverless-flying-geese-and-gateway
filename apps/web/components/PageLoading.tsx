import { cn } from "@/lib/utils";

/**
 * Reusable skeleton shown while a server component suspends. Used by
 * the loading.tsx files. Each page passes the same wrapper sizing it
 * uses (max-width, vertical padding, mb on header) so the skeleton
 * doesn't shift when the real content lands.
 */
export function PageLoading({
  eyebrow,
  title,
  description,
  variant = "list",
  maxWidth = "5xl",
  paddingY = "py-12",
  headerMb = "mb-8",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  variant?: "list" | "grid" | "form" | "split";
  maxWidth?: "3xl" | "5xl" | "7xl";
  paddingY?: "py-10" | "py-12";
  headerMb?: "mb-6" | "mb-8";
}) {
  const maxWidthClass = { "3xl": "max-w-3xl", "5xl": "max-w-5xl", "7xl": "max-w-7xl" }[maxWidth];

  return (
    <div className={cn("mx-auto px-6", maxWidthClass, paddingY)}>
      <div className={headerMb}>
        {eyebrow && (
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</div>
        )}
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          Waking machines from idle — first request after a long pause can take 5–15 s.
        </div>
      </div>

      {variant === "list" && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}
      {variant === "grid" && (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      )}
      {variant === "form" && (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}
      {variant === "split" && (
        <div className="grid gap-4 md:grid-cols-[320px,1fr]">
          <Skeleton className="h-[64vh]" />
          <Skeleton className="h-[72vh]" />
        </div>
      )}
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-xl border border-border/60 bg-card/40",
        className,
      )}
    />
  );
}
