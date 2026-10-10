import { Fragment } from "react";

/** The little Markdown the assistant uses: **bold**, short lists and paragraphs. Nothing else is interpreted, so nothing can inject markup. */
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") && part.endsWith("**") && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>));
}

export function RichText({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className="flex flex-col gap-2.5">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*(?:[-*•]|\d+[.)])\s+/.test(l))) {
          const ordered = /^\s*\d+[.)]/.test(lines[0]);
          const Tag = ordered ? "ol" : "ul";
          return (
            <Tag key={i} className={ordered ? "list-decimal space-y-1 pl-5" : "list-disc space-y-1 pl-5"}>
              {lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ""))}</li>)}
            </Tag>
          );
        }
        return <p key={i}>{lines.map((l, j) => <Fragment key={j}>{j ? <br /> : null}{inline(l)}</Fragment>)}</p>;
      })}
    </div>
  );
}
