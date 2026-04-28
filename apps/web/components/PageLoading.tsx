import { cn } from "@/lib/utils";

/**
 * Reusable skeleton shown while a server component suspends. Used by
 * the various loading.tsx files. Keeps the same visual rhythm as the
 * real pages so the layout doesn't jolt when the data arrives.
 */
export function PageLoading({
  eyebrow,
  title,
  description,
  variant = "list",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  variant?: "list" | "grid" | "form";
}) {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6">
        {eyebrow && (
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</div>
        )}
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
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
