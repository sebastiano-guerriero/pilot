import { TEXT_EDIT_ATTRIBUTE, holdText } from "../dom/text.ts";

/**
 * Inline text editing: a double-click on a text-only element (dom/text.ts,
 * isTextOnly) makes its text editable where it is, with the word under the
 * pointer selected, as a double-click does in any text. The element is
 * `contenteditable` while it's edited (plain text only), then exactly as it
 * was: its attributes and its text nodes are put back, and the history's
 * text preview shows the result (dom/text.ts). Nothing the designer types
 * reaches the page's own handlers (select mode, useElementPicker).
 *
 * - Enter, or leaving the element (a click elsewhere, focus moving to
 *   Pilot's dialog): done, `onDone(text)` with what's in it now.
 * - Esc: cancelled, `onDone(null)`; the text is as it was.
 *
 * Returns `finish(commit)`, to end the edit from outside (the selection
 * changed, the tool turned off).
 */
export function editText(
  element: HTMLElement,
  at: { x: number; y: number } | null,
  onDone: (text: string | null) => void,
): (commit: boolean) => void {
  const release = holdText(element);
  // Everything that's put back afterwards: the nodes, their text, the attributes.
  const nodes = [...element.childNodes];
  const data = nodes.map((n) => (n.nodeType === Node.TEXT_NODE ? (n as Text).data : null));
  const editable = element.getAttribute("contenteditable");
  const spellcheck = element.getAttribute("spellcheck");

  element.setAttribute("contenteditable", plaintextOnly() ? "plaintext-only" : "true");
  element.setAttribute(TEXT_EDIT_ATTRIBUTE, "");
  element.setAttribute("spellcheck", "false");
  element.focus({ preventScroll: true });
  selectWordAt(element, at);

  let finished = false;
  const finish = (commit: boolean) => {
    if (finished) return;
    finished = true;
    const text = element.textContent ?? "";
    element.removeEventListener("keydown", onKeyDown);
    for (const type of QUIET_EVENTS) element.removeEventListener(type, stop);
    element.removeEventListener("blur", onBlur);
    element.removeEventListener("paste", onPaste);
    element.removeEventListener("drop", onDrop);
    restoreAttribute(element, "contenteditable", editable);
    restoreAttribute(element, "spellcheck", spellcheck);
    element.removeAttribute(TEXT_EDIT_ATTRIBUTE);
    if (element.ownerDocument.activeElement === element) element.blur();
    window.getSelection()?.removeAllRanges();
    // Typing may have split, merged or replaced the text nodes: the page's own go back.
    const current = [...element.childNodes];
    if (current.length !== nodes.length || current.some((n, i) => n !== nodes[i])) element.replaceChildren(...nodes);
    nodes.forEach((n, i) => {
      const d = data[i];
      if (d != null && (n as Text).data !== d) (n as Text).data = d;
    });
    release();
    onDone(commit ? text : null);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation(); // the page's own key handlers (a hotkey, a button's Space) don't get it
    if (e.isComposing) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      finish(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      finish(false);
    }
  };
  // Focus left the element (the window losing focus, switching apps, doesn't count).
  const onBlur = () => {
    if (element.ownerDocument.activeElement !== element) finish(true);
  };
  const stop = (e: Event) => e.stopPropagation();
  // Plain text only, also where `plaintext-only` isn't supported: no markup pasted or dropped in.
  const onPaste = (e: ClipboardEvent) => {
    e.preventDefault();
    insertText(e.clipboardData?.getData("text/plain") ?? "");
  };
  const onDrop = (e: DragEvent) => e.preventDefault();
  element.addEventListener("keydown", onKeyDown);
  for (const type of QUIET_EVENTS) element.addEventListener(type, stop);
  element.addEventListener("blur", onBlur);
  element.addEventListener("paste", onPaste);
  element.addEventListener("drop", onDrop);
  return finish;
}

/** What typing sends besides keydown, kept from the page's handlers (they bubble from the element). */
const QUIET_EVENTS = ["keyup", "keypress", "beforeinput", "input", "compositionstart", "compositionupdate", "compositionend"] as const;

function restoreAttribute(element: Element, name: string, value: string | null): void {
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

let plaintext: boolean | undefined;
/** Whether the browser has `contenteditable="plaintext-only"` (Chrome, Safari, Firefox 136+). */
function plaintextOnly(): boolean {
  if (plaintext === undefined) {
    const probe = document.createElement("div");
    probe.setAttribute("contenteditable", "plaintext-only");
    plaintext = probe.contentEditable === "plaintext-only";
  }
  return plaintext;
}

/** Typed text, single line: a paste's line breaks become spaces (Enter is "done"). */
function insertText(text: string): void {
  const line = text.replace(/\s*[\r\n]+\s*/g, " ");
  // execCommand keeps the field's own undo (Cmd+Z while editing); deprecated, but nothing replaces it yet.
  if (!document.execCommand("insertText", false, line)) {
    const range = window.getSelection()?.getRangeAt(0);
    if (!range) return;
    range.deleteContents();
    range.insertNode(document.createTextNode(line));
    range.collapse(false);
  }
}

/** Letters, digits and the marks inside words (`don't`, `e-mail`): what a double-click selects. */
const WORD = /[\p{L}\p{N}\p{M}_'’-]/u;

/**
 * Selects the word at the point (the double-click), or puts the caret at
 * the end of the text when there's no point or no word under it.
 */
export function selectWordAt(element: HTMLElement, at: { x: number; y: number } | null): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  const hit = at ? caretAt(at.x, at.y) : null;
  if (hit && element.contains(hit.node) && hit.node.nodeType === Node.TEXT_NODE) {
    const text = (hit.node as Text).data;
    let start = hit.offset;
    let end = hit.offset;
    while (start > 0 && WORD.test(text[start - 1] as string)) start--;
    while (end < text.length && WORD.test(text[end] as string)) end++;
    range.setStart(hit.node, start);
    range.setEnd(hit.node, end);
  } else {
    range.selectNodeContents(element);
    range.collapse(false);
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as Document & {
    caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?(x: number, y: number): Range | null;
  };
  if (doc.caretPositionFromPoint) {
    const p = doc.caretPositionFromPoint(x, y);
    return p ? { node: p.offsetNode, offset: p.offset } : null;
  }
  const r = doc.caretRangeFromPoint?.(x, y);
  return r ? { node: r.startContainer, offset: r.startOffset } : null;
}
