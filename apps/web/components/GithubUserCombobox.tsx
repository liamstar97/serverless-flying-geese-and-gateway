"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface GhUserSuggestion {
  login: string;
  avatar_url: string;
  html_url: string;
}

/**
 * Debounced search-as-you-type against /api/github/search-users.
 * Shows a dropdown of matches under the input. ↑/↓ navigates,
 * Enter / click selects, Esc closes. Selecting calls onSelect with
 * the chosen login.
 */
export function GithubUserCombobox({
  value,
  onChange,
  onSelect,
  placeholder = "github-login",
  disabled,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect?: (login: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [results, setResults] = useState<GhUserSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const acRef = useRef<AbortController | null>(null);

  // Debounced fetch.
  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    acRef.current?.abort();
    const ac = new AbortController();
    acRef.current = ac;

    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/github/search-users?q=${encodeURIComponent(q)}`, {
          signal: ac.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { results: GhUserSuggestion[] };
        setResults(body.results);
        setHighlight(0);
        setOpen(true);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => { clearTimeout(t); ac.abort(); };
  }, [value]);

  // Click outside to close.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const select = (login: string) => {
    onChange(login);
    onSelect?.(login);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <Input
        id={inputId}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        className="font-mono text-sm"
        onKeyDown={(e) => {
          if (!open || results.length === 0) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => (h + 1) % results.length); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => (h - 1 + results.length) % results.length); }
          else if (e.key === "Enter") {
            const pick = results[highlight];
            if (pick) { e.preventDefault(); select(pick.login); }
          } else if (e.key === "Escape") setOpen(false);
        }}
      />
      {loading && (
        <Loader2 className="absolute right-2 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}

      {open && results.length > 0 && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-72 overflow-auto rounded-lg border bg-popover py-1 shadow-xl"
        >
          {results.map((r, i) => (
            <li key={r.login}>
              <button
                type="button"
                role="option"
                aria-selected={i === highlight}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => select(r.login)}
                className={cn(
                  "flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm transition-colors",
                  i === highlight ? "bg-accent" : "hover:bg-accent/60",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={r.avatar_url}
                  alt=""
                  width={20}
                  height={20}
                  className="size-5 rounded-full bg-muted"
                />
                <code className="font-mono text-foreground/90">{r.login}</code>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
