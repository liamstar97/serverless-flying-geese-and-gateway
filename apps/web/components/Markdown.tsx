"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

import { cn } from "@/lib/utils";

/**
 * Renders the assistant's reply as markdown — GFM features (tables,
 * strikethrough, autolinks) plus highlight.js syntax highlighting on
 * fenced code blocks.
 *
 * Component classes are tuned for tight in-bubble rendering: tighter
 * leading than prose defaults, no big heading margins, code blocks get
 * the dark theme from globals.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("gloop-markdown", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          a: ({ children, href, ...rest }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2" {...rest}>
              {children}
            </a>
          ),
          p: ({ children }) => <p className="my-1.5 leading-relaxed first:mt-0 last:mb-0">{children}</p>,
          h1: ({ children }) => <h1 className="mb-2 mt-4 text-lg font-semibold first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 mt-4 text-base font-semibold first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-1 mt-3 text-sm font-semibold first:mt-0">{children}</h3>,
          ul: ({ children }) => <ul className="my-1.5 ml-5 list-disc space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="my-1.5 ml-5 list-decimal space-y-0.5">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-primary/40 pl-3 italic text-muted-foreground">
              {children}
            </blockquote>
          ),
          code: ({ className: cls, children, ...rest }) => {
            const isInline = !cls;
            if (isInline) {
              return (
                <code className="rounded bg-secondary/60 px-1 py-0.5 font-mono text-[0.9em]" {...rest}>
                  {children}
                </code>
              );
            }
            return <code className={cls} {...rest}>{children}</code>;
          },
          pre: ({ children }) => (
            <pre className="my-2 overflow-x-auto rounded-lg border bg-background/60 p-3 font-mono text-[12px] leading-relaxed">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="w-full text-left text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border-b border-border px-2 py-1 font-semibold">{children}</th>,
          td: ({ children }) => <td className="border-b border-border/60 px-2 py-1">{children}</td>,
          hr: () => <hr className="my-3 border-border" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
