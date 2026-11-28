// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { conditionKey, conditionName, conditionSelector, conditionVariant, holdsNow, readCondition, sameCondition } from "./condition.ts";

let element: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = `
    <section class="card" id="card">
      <div class="row" id="row">
        <span class="label" id="before">Label</span>
        <p class="title" id="title" data-open>Title</p>
        <em id="after">after</em>
      </div>
    </section>`;
  element = document.getElementById("title") as HTMLElement;
});
afterEach(() => {
  document.body.innerHTML = "";
});

const read = (words: string) => readCondition(words, element);
const selectorOf = (words: string) => {
  const r = read(words);
  return "condition" in r ? r.condition.selector : `error: ${r.error}`;
};

describe("readCondition: who and what, in words", () => {
  it("the parent (direct, or the nearest ancestor with its class)", () => {
    expect(selectorOf("the parent has focus inside")).toBe(":focus-within > &");
    expect(selectorOf("the parent .card has focus inside")).toBe(".card:focus-within &");
    expect(selectorOf("the parent .row is hovered")).toBe(".row:hover > &");
    expect(selectorOf("when the parent with class card is hovered")).toBe(".card:hover &");
    const r = read("the parent .card has focus inside");
    expect("target" in r && r.target?.id).toBe("card");
  });

  it("an ancestor, a container, inside", () => {
    expect(selectorOf("inside .card that is open")).toBe(".card[open] &");
    expect(selectorOf("the container .card has data-active")).toBe('.card[data-active] &');
  });

  it("siblings: the previous one before it, the next one through :has()", () => {
    expect(selectorOf("the previous sibling is checked")).toBe(":checked + &");
    expect(selectorOf("the next sibling is hovered")).toBe("&:has(+ *:hover)");
    const r = read("the previous sibling is checked");
    expect("target" in r && r.target?.id).toBe("before");
  });

  it("the element itself: an attribute, a class, a state", () => {
    expect(selectorOf("it has data-open")).toBe("&[data-open]");
    expect(selectorOf('data-state is "open"')).toBe('&[data-state="open"]');
    expect(selectorOf("aria-pressed is true")).toBe('&[aria-pressed="true"]');
    expect(selectorOf("it has class is-active")).toBe("&.is-active");
    expect(selectorOf("it is the first child")).toBe("&:first-child");
    expect(selectorOf("it is expanded")).toBe('&[aria-expanded="true"]');
  });

  it("negated: not, isn't, without", () => {
    expect(selectorOf("the parent isn't hovered")).toBe(":not(:hover) > &");
    expect(selectorOf("it doesn't have data-open")).toBe("&:not([data-open])");
  });

  it("an ancestor it names that isn't there: says so", () => {
    expect(selectorOf("the parent .nope is hovered")).toMatch(/^error: No \.nope around/);
  });

  it("words it can't read: how to reword them", () => {
    expect(selectorOf("when it feels right")).toMatch(/^error: Pilot can't read that yet/);
    expect(selectorOf("  ")).toMatch(/^error: Describe when/);
  });
});

describe("readCondition: media in words", () => {
  const mediaOf = (words: string) => {
    const r = read(words);
    return "condition" in r ? r.condition.media : `error: ${r.error}`;
  };
  it("reduced motion, print, orientation, touch, contrast", () => {
    expect(mediaOf("with reduced motion")).toBe("(prefers-reduced-motion: reduce)");
    expect(mediaOf("when printing")).toBe("print");
    expect(mediaOf("in landscape")).toBe("(orientation: landscape)");
    expect(mediaOf("on touch screens")).toBe("(hover: none)");
    expect(mediaOf("with more contrast")).toBe("(prefers-contrast: more)");
  });
});

describe("readCondition: CSS as written", () => {
  it("a selector with & for the element, kept as the subject", () => {
    expect(selectorOf(".card:hover &")).toBe(".card:hover &");
    expect(selectorOf("&[data-state=open]")).toBe("&[data-state=open]");
    // & first: it would style the other element, so it's the element having it.
    expect(selectorOf("& + .error")).toBe("&:has(+ .error)");
    expect(selectorOf("& .icon")).toBe("&:has(.icon)");
  });
  it("a media condition", () => {
    const r = read("(prefers-reduced-motion: reduce)");
    expect("condition" in r && r.condition.media).toBe("(prefers-reduced-motion: reduce)");
  });
  it("a selector the browser doesn't take: says so", () => {
    expect(selectorOf(".card:::hover &")).toMatch(/^error: /);
  });
});

describe("holdsNow, keys", () => {
  it("matches the element for the selector (its & is the element)", () => {
    expect(holdsNow({ words: "", selector: "&[data-open]" }, element)).toBe(true);
    expect(holdsNow({ words: "", selector: ".card &" }, element)).toBe(true);
    expect(holdsNow({ words: "", selector: ".nope &" }, element)).toBe(false);
  });
  it("one condition however it's put: the CSS is its key", () => {
    expect(sameCondition({ words: "it has data-open", selector: "&[data-open]" }, { words: "with data-open", selector: "&[data-open]" })).toBe(true);
    expect(conditionKey(null)).toBe("");
    expect(conditionSelector({ words: "", selector: ".card:hover &" }, '[data-pilot-edit="3"]')).toBe('.card:hover [data-pilot-edit="3"]');
  });
});

describe("conditionVariant, conditionName: Tailwind's words for it", () => {
  const variantOf = (words: string) => {
    const r = read(words);
    return "condition" in r ? conditionVariant(r.condition) : `error: ${r.error}`;
  };
  it("the element's own: data-*, aria-*, states, not-*", () => {
    expect(variantOf("it has data-open")).toBe("data-open");
    expect(variantOf('data-state is "open"')).toBe("data-[state=open]");
    expect(variantOf("it is expanded")).toBe("aria-expanded");
    expect(variantOf("it is the first child")).toBe("first");
    expect(variantOf("it doesn't have data-open")).toBe("not-data-open");
  });
  it("an ancestor or the parent: group-*, named by its class; the previous sibling: peer-*", () => {
    expect(variantOf("the parent .card has focus inside")).toBe("group-focus-within/card");
    expect(variantOf("inside .card that is open")).toBe("group-open/card");
    expect(variantOf("the previous sibling is checked")).toBe("peer-checked");
  });
  it("media: motion-reduce, print…; none: Tailwind's brackets", () => {
    expect(variantOf("with reduced motion")).toBe("motion-reduce");
    expect(variantOf("when printing")).toBe("print");
    expect(variantOf("on touch screens")).toBe("[@media(hover:none)]");
    expect(variantOf("the next sibling is hovered")).toBe("has-[+_*:hover]");
  });
  it("the name: Tailwind's words, or the designer's when it's brackets", () => {
    expect(conditionName({ words: "it has data-selected", selector: "&[data-selected]" })).toBe("Data selected");
    expect(conditionName({ words: "the parent .card is hovered", selector: ".card:hover &" })).toBe("Group hover card");
    expect(conditionName({ words: "the next one is hovered", selector: "&:has(+ *:hover)" })).toBe("the next one is hovered");
  });
});

describe("readCondition: more rules", () => {
  const on = (html: string, id: string) => {
    document.body.innerHTML = html;
    return document.getElementById(id) as HTMLElement;
  };
  const sel = (words: string, el: Element) => {
    const r = readCondition(words, el);
    if (!("condition" in r)) return `error: ${r.error}`;
    const c = r.condition;
    return c.selector ?? [c.media && `media ${c.media}`, c.container && `container ${c.container}`].filter(Boolean).join(" ");
  };

  it("an element named in plain words: a tag, a class, or one it's part of; the element itself when it's the one", () => {
    const title = on(`<ul><li class="rounded-card"><p id="t">x</p></li></ul>`, "t");
    expect(sel("the card is hovered", title)).toBe(".rounded-card:hover &");
    expect(sel("the list has focus inside", title)).toBe(":is(ul, ol):focus-within &");
    expect(sel("the parent item is hovered", title)).toBe("li:hover > &");
    const card = on(`<div class="card" id="c"></div>`, "c");
    expect(sel("the card is hovered", card)).toBe("&:hover");
    expect(sel("the sidebar is open", card)).toMatch(/^error: No “sidebar” around/);
  });

  it("what it contains, and how many", () => {
    const el = on(`<div id="d"></div>`, "d");
    expect(sel("it contains an image", el)).toBe("&:has(img)");
    expect(sel("it has a checked checkbox", el)).toBe('&:has(input[type="checkbox"]:checked)');
    expect(sel("it contains a .badge", el)).toBe("&:has(.badge)");
    expect(sel("it has more than 3 items", el)).toBe("&:has(> :nth-child(4))");
    expect(sel("it has fewer than 2 items", el)).toBe("&:not(:has(> :nth-child(2)))");
  });

  it("its place in a list", () => {
    const el = on(`<div id="d"></div>`, "d");
    expect(sel("every other row", el)).toBe("&:nth-child(odd)");
    expect(sel("the even rows", el)).toBe("&:nth-child(even)");
    expect(sel("the third item", el)).toBe("&:nth-child(3)");
    expect(sel("the 5th one", el)).toBe("&:nth-child(5)");
    expect(sel("it is the only child", el)).toBe("&:only-child");
  });

  it("more states: a field showing its placeholder (an empty field), valid, read only, visited, closed", () => {
    const input = on(`<input id="i">`, "i");
    expect(sel("it is empty", input)).toBe("&:placeholder-shown");
    expect(sel("the placeholder is shown", input)).toBe("&:placeholder-shown");
    expect(sel("it is valid", input)).toBe("&:valid");
    expect(sel("it is invalid", input)).toBe("&:invalid");
    expect(sel("it is read only", input)).toBe("&:read-only");
    const link = on(`<a id="a" href="#">x</a>`, "a");
    expect(sel("it was visited", link)).toBe("&:visited");
    const details = on(`<details id="d"></details>`, "d");
    expect(sel("it is closed", details)).toBe("&:not([open])");
  });

  it("sizes: a container's (container query), the screen's (media); a count isn't one", () => {
    const el = on(`<div id="d"></div>`, "d");
    // A container query is about the nearest container, whatever is named; the one named is what's highlighted.
    const p = on(`<div class="card"><p id="p"></p></div>`, "p");
    expect(sel("the card is narrower than 400px", p)).toBe("container (width < 400px)");
    const reading = readCondition("the card is narrower than 400px", p);
    expect("target" in reading && (reading.target as Element).className).toBe("card");
    expect(sel("narrower than 400px", el)).toBe("container (width < 400px)");
    expect(sel("wider than 30rem", el)).toBe("container (width > 30rem)");
    expect(sel("when the screen is narrower than 600px", el)).toBe("media (width < 600px)");
    expect(sel("it has more than 3 items", el)).toBe("&:has(> :nth-child(4))");
  });

  it("Tailwind's words for the new ones", () => {
    const el = on(`<div id="d"></div>`, "d");
    const variantOf = (words: string) => {
      const r = readCondition(words, el);
      return "condition" in r ? conditionVariant(r.condition) : `error: ${r.error}`;
    };
    expect(variantOf("every other row")).toBe("odd");
    expect(variantOf("it contains an image")).toBe("has-[img]");
    expect(variantOf("narrower than 400px")).toBe("@max-[400px]");
    expect(variantOf("when the screen is wider than 600px")).toBe("min-[600px]");
  });
});

describe("readCondition: several together, Tailwind's peer and group", () => {
  const on = (html: string, id: string) => {
    document.body.innerHTML = html;
    return document.getElementById(id) as HTMLElement;
  };
  const read2 = (words: string, el: Element) => {
    const r = readCondition(words, el);
    return "condition" in r ? `${r.condition.selector} | ${conditionVariant(r.condition)}` : `error: ${r.error}`;
  };
  it("joined by and: each read, all of them on the one named", () => {
    const el = on(`<div class="wrap" data-checked="true"><span class="featured"></span><p id="t">x</p></div>`, "t");
    expect(read2("parents has data-checked=true and focus-within", el)).toBe(
      '[data-checked="true"]:focus-within > & | group-data-[checked=true]:group-focus-within',
    );
    expect(read2("it is hovered and not disabled", el)).toBe("&:hover:not(:disabled) | hover:not-disabled");
  });
  it("a peer: any sibling before it, by its class", () => {
    const el = on(`<div><span class="featured"></span><em></em><p id="t">x</p></div>`, "t");
    expect(read2("peer with class .featured and disabled", el)).toBe(".featured:disabled ~ & | peer-disabled/featured");
    expect(read2("a peer .nope is checked", el)).toMatch(/^error: No \.nope before/);
    const hint = on(`<label><input><span id="h">hint</span></label>`, "h");
    expect(read2("the peer input is invalid and not focused", hint)).toBe("input:invalid:not(:focus) ~ & | peer-invalid:peer-not-focus");
  });
  it("a part that doesn't read: the whole doesn't (nothing dropped)", () => {
    const el = on(`<div><p id="t">x</p></div>`, "t");
    expect(read2("it is hovered and feels right", el)).toMatch(/^error: Pilot can't read/);
  });
});

describe("readCondition: a sibling on either side; children and what's inside", () => {
  const on = (html: string, id: string) => {
    document.body.innerHTML = html;
    return document.getElementById(id) as HTMLElement;
  };
  const sel = (words: string, el: Element) => {
    const r = readCondition(words, el);
    return "condition" in r ? `${r.condition.selector} | ${conditionVariant(r.condition)}` : `error: ${r.error}`;
  };

  it("a sibling, neither previous nor next: one on either side", () => {
    const el = on(`<div><em></em><p id="t">x</p><span class="featured"></span></div>`, "t");
    expect(sel("a sibling is hovered", el)).toBe("&:is(*:hover ~ *, :has(~ *:hover)) | [&:is(*:hover_~_*,_:has(~_*:hover))]");
    expect(sel("the sibling .featured is disabled", el)).toBe("&:is(.featured:disabled ~ *, :has(~ .featured:disabled)) | [&:is(.featured:disabled_~_*,_:has(~_.featured:disabled))]");
    expect(sel("a sibling .nope is checked", el)).toMatch(/^error: No \.nope beside/);
    // Previous and next still say which side.
    expect(sel("the previous sibling is checked", el)).toBe(":checked + & | peer-checked");
  });

  it("a child, children, a descendant, something inside: the element has one", () => {
    const el = on(`<ul id="u"><li class="item"><span class="badge"></span></li></ul>`, "u");
    expect(sel("a child is hovered", el)).toBe("&:has(> :hover) | has-[>_:hover]");
    expect(sel("it has a child .item that is checked", el)).toBe("&:has(> .item:checked) | has-[>_.item:checked]");
    expect(sel("has a child item", el)).toBe("&:has(> li) | has-[>_li]");
    expect(sel("any descendant has focus", el)).toBe("&:has(:focus) | has-[:focus]");
    expect(sel("something inside is checked and disabled", el)).toBe("&:has(:checked:disabled) | has-[:checked:disabled]");
    // Named deeper than a child: anywhere inside.
    expect(sel("a child .badge is hovered", el)).toBe("&:has(.badge:hover) | has-[.badge:hover]");
    expect(sel("it has no children", el)).toBe("&:not(:has(> *)) | not-has-[>_*]");
    // One named by its class that isn't inside right now: taken (what's inside often comes later, a badge added).
    expect(sel("a child .nope is hovered", el)).toBe("&:has(.nope:hover) | has-[.nope:hover]");
  });

  it("its own place and counts aren't children", () => {
    const el = on(`<div id="d"></div>`, "d");
    expect(sel("it is the first child", el)).toBe("&:first-child | first");
    expect(sel("it is the only child", el)).toBe("&:only-child | only");
    expect(sel("it has more than 3 children", el)).toBe("&:has(> :nth-child(4)) | has-[>_:nth-child(4)]");
  });
});
