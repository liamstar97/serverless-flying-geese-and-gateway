"use client";

import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { lintGutter, linter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";

/**
 * JSON editor with the language pack + parse linter wired up. The lint
 * gutter shows red dots next to malformed lines; hovering shows the
 * `JSON.parse` error message at the precise offset.
 *
 * Theme matches the rest of the dark UI — we override CodeMirror's
 * default backgrounds via EditorView.theme so the editor blends with
 * the surrounding card instead of looking like a foreign element.
 */
export function JsonEditor({
  value,
  onChange,
  className,
  height,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  height?: string;
}) {
  const extensions = useMemo(
    () => [
      json(),
      linter(jsonParseLinter()),
      lintGutter(),
      EditorView.theme(
        {
          "&": {
            background: "transparent",
            color: "var(--foreground)",
            fontFamily: "var(--font-mono)",
            fontSize: "12.5px",
          },
          ".cm-content": { caretColor: "var(--primary)" },
          ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--primary)" },
          ".cm-gutters": {
            background: "transparent",
            color: "var(--muted-foreground)",
            border: "none",
            opacity: "0.6",
          },
          ".cm-activeLine": { background: "color-mix(in oklab, var(--primary) 6%, transparent)" },
          ".cm-activeLineGutter": { background: "transparent", color: "var(--foreground)" },
          ".cm-selectionBackground, ::selection": {
            background: "color-mix(in oklab, var(--primary) 22%, transparent) !important",
          },
          ".cm-tooltip": {
            background: "var(--popover)",
            color: "var(--popover-foreground)",
            border: "1px solid var(--border)",
            borderRadius: "6px",
          },
        },
        { dark: true },
      ),
    ],
    [],
  );

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      basicSetup={{
        lineNumbers: true,
        highlightActiveLine: true,
        highlightActiveLineGutter: true,
        bracketMatching: true,
        closeBrackets: true,
        autocompletion: true,
        foldGutter: true,
      }}
      height={height ?? "100%"}
      className={className}
      theme="dark"
    />
  );
}
