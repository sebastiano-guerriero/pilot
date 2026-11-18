import type { ComponentChildren, JSX } from "preact";

/**
 * The agent's replies as markdown, the subset agents write by habit:
 * paragraphs (a single newline is a line break), **bold**, *italic*,
 * `inline code`, fenced code blocks, and bulleted and numbered lists.
 * Headings show as bold paragraphs, quotes as plain ones, links as their
 * text. Everything else stays as written.
 *
 * Builds elements, never HTML: whatever the text holds (tags included)
 * shows as text, so a reply can't inject anything into the page.
 */
export function renderMarkdown(text: string): JSX.Element[] {
  return blocks(text).map((block, i) => {
    switch (block.kind) {
      case "code":
        return (
          <pre key={i}>
            <code>{block.text}</code>
          </pre>
        );
      case "list": {
        const items = block.items.map((item, j) => <li key={j}>{inline(item)}</li>);
        if (block.start === undefined) return <ul key={i}>{items}</ul>;
        return (
          <ol key={i} start={block.start === 1 ? undefined : block.start}>
            {items}
          </ol>
        );
      }
      case "heading":
        return (
          <p key={i}>
            <strong>{inline(block.text)}</strong>
          </p>
        );
      default:
        return <p key={i}>{lines(block.text)}</p>;
    }
  });
}

type Block =
  | { kind: "paragraph"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "code"; text: string }
  /** `start` for a numbered list (its first number), none for bullets. */
  | { kind: "list"; items: string[]; start?: number };

const FENCE = /^\s*(```|~~~)/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*?)\s*#*\s*$/;
const QUOTE = /^\s*>\s?/;

/** The text's blocks, line by line. */
export function blocks(text: string): Block[] {
  const out: Block[] = [];
  const src = text.replace(/\r\n?/g, "\n").split("\n");
  let paragraph: string[] = [];
  const endParagraph = () => {
    if (paragraph.length) out.push({ kind: "paragraph", text: paragraph.join("\n") });
    paragraph = [];
  };
  for (let i = 0; i < src.length; i++) {
    const line = src[i] as string;
    const fence = FENCE.exec(line);
    if (fence) {
      endParagraph();
      const code: string[] = [];
      // Up to the closing fence, or the end of the text when there's none.
      for (i++; i < src.length && !(src[i] as string).trimStart().startsWith(fence[1] as string); i++) code.push(src[i] as string);
      out.push({ kind: "code", text: code.join("\n") });
      continue;
    }
    if (!line.trim()) {
      endParagraph();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      endParagraph();
      out.push({ kind: "heading", text: heading[1] as string });
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = NUMBERED.exec(line);
    if (bullet || numbered) {
      endParagraph();
      const item = (bullet ? bullet[1] : numbered?.[2]) as string;
      const last = out[out.length - 1];
      // The same kind of list as the one just before (nothing in between): one more item.
      if (last?.kind === "list" && (last.start === undefined) === !!bullet && src[i - 1]?.trim()) last.items.push(item);
      else out.push(bullet ? { kind: "list", items: [item] } : { kind: "list", items: [item], start: Number(numbered?.[1]) });
      continue;
    }
    const last = out[out.length - 1];
    // An indented line right after an item continues it.
    if (!paragraph.length && last?.kind === "list" && /^\s+/.test(line) && src[i - 1]?.trim()) {
      last.items[last.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    paragraph.push(line.replace(QUOTE, ""));
  }
  endParagraph();
  return out;
}

/** A paragraph's lines, with a line break between each. */
function lines(text: string): ComponentChildren[] {
  return text.split("\n").flatMap((line, i) => (i ? [<br key={`br${i}`} />, ...inline(line)] : inline(line)));
}

/**
 * Inline: `code` (taken as is), **bold** / __bold__, *italic*, and
 * [links](url) as their text. Underscores alone don't make italics, so
 * snake_case names stay intact.
 */
const INLINE = /`([^`]+)`|\*\*(.+?)\*\*|__(.+?)__|\*(?=\S)(.+?)(?<=\S)\*|\[([^\]]+)\]\([^)\s]*\)/g;

export function inline(text: string): ComponentChildren[] {
  const out: ComponentChildren[] = [];
  let at = 0;
  for (const m of text.matchAll(INLINE)) {
    const index = m.index ?? 0;
    if (index > at) out.push(text.slice(at, index));
    const [, code, bold, boldU, italic, link] = m;
    if (code !== undefined) out.push(<code key={index}>{code}</code>);
    else if (bold !== undefined || boldU !== undefined) out.push(<strong key={index}>{inline((bold ?? boldU) as string)}</strong>);
    else if (italic !== undefined) out.push(<em key={index}>{inline(italic)}</em>);
    else out.push(...inline(link as string));
    at = index + m[0].length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}
