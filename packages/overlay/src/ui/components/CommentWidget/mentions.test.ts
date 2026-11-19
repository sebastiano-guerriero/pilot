// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  insertMention,
  matchMentions,
  type MentionOption,
  mentionAt,
  mentionOptions,
  mentionsIn,
  projectOptions,
  splitMentions,
} from "./mentions.ts";

const token = (name: string, value: string): MentionOption => ({ group: "Tokens", label: name, insert: name, detail: value });
const component = (name: string): MentionOption => ({ group: "Components", label: name, insert: `@${name}` });

describe("mentions", () => {
  it("an @ at the start or after a space, up to the caret; not one in a word (an email)", () => {
    expect(mentionAt("@", 1)).toEqual({ start: 0, query: "" });
    expect(mentionAt("make it @col", 12)).toEqual({ start: 8, query: "col" });
    expect(mentionAt("mail me at a@b.c", 16)).toBeNull();
    expect(mentionAt("@col red", 8)).toBeNull(); // past a space: done
  });

  it("the page's tokens, components and elements as options: how each goes into the text, a swatch for colors", () => {
    const card = document.createElement("div");
    const options = mentionOptions({
      tokens: [
        { name: "--color-accent", value: "#1cf69e", kind: "color" },
        { name: "--radius", value: "8px", kind: "length" },
      ],
      components: [{ name: "ProductCard", element: card }],
      elements: [{ name: "section#features", element: card }],
    });
    expect(options.map((o) => [o.group, o.insert, o.swatch])).toEqual([
      ["Tokens", "--color-accent", "#1cf69e"],
      ["Tokens", "--radius", undefined],
      ["Components", "@ProductCard", undefined],
      ["Elements", "@section#features", undefined],
    ]);
  });

  it("matches by group, the ones starting with the query first, without case or prefixes", () => {
    const options = [
      token("--radius-lg", "8px"),
      token("--color-accent", "#1cf69e"),
      token("--color-red", "#ff4650"),
      component("ProductCard"),
    ];
    expect(matchMentions(options, "col").map((o) => o.label)).toEqual(["--color-accent", "--color-red"]);
    expect(matchMentions(options, "--rad").map((o) => o.label)).toEqual(["--radius-lg"]);
    expect(matchMentions(options, "product").map((o) => o.label)).toEqual(["ProductCard"]);
    expect(matchMentions(options, "").map((o) => o.group)).toEqual(["Tokens", "Tokens", "Tokens", "Components"]);
    // A token's value matches too.
    expect(matchMentions(options, "ff4650").map((o) => o.label)).toEqual(["--color-red"]);
  });

  it("inserts the pick in place of @query, with a space, and puts the caret after it", () => {
    expect(insertMention("make it @col please", { start: 8, query: "col" }, "--color-accent")).toEqual({
      text: "make it --color-accent please",
      caret: 23,
    });
    expect(insertMention("@Pro", { start: 0, query: "Pro" }, "@ProductCard")).toEqual({ text: "@ProductCard ", caret: 13 });
  });

  it("what the text mentions, in its order, once each: picks still in it, typed names of listed things, the rest unlisted", () => {
    const accent = token("--color-accent", "#1cf69e");
    const card = component("ProductCard");
    const picked = [accent, card];
    expect(mentionsIn("make @ProductCard --color-accent, like @ProductCard", picked, []).map((o) => o.label)).toEqual([
      "ProductCard",
      "--color-accent",
    ]);
    // A pick taken out of the text is gone.
    expect(mentionsIn("make it green", picked, [])).toEqual([]);
    // Typed, not picked: the listed thing it names (without case when only one matches); punctuation and 's aren't part of it.
    const typed = mentionsIn("Like @productcard's title (and @Hero). Use --color-accent", [], [accent, card]);
    expect(typed.map((o) => [o.group, o.label])).toEqual([
      ["Components", "ProductCard"],
      ["Unlisted", "Hero"],
      ["Tokens", "--color-accent"],
    ]);
    // A --name the page doesn't define is just text; an email isn't a mention.
    expect(mentionsIn("--nope and a@b.c", [], [accent])).toEqual([]);
  });

  it("the project's components after the page's, with their folder; those on the page aren't listed twice", () => {
    const page = [component("ProductCard")];
    const options = projectOptions(
      [
        { name: "ProductCard", file: "src/ProductCard.tsx", line: 3 },
        { name: "PricingTable", file: "packages/ui/src/pricing/table.tsx", line: 12 },
      ],
      page,
    );
    expect(options).toEqual([
      {
        group: "Components",
        label: "PricingTable",
        insert: "@PricingTable",
        detail: "packages/ui/src/pricing",
        source: { file: "packages/ui/src/pricing/table.tsx", line: 12 },
      },
    ]);
  });

  it("splits a sent message into text and its mentions, for the thread", () => {
    const references = [
      { kind: "token" as const, name: "--color-accent", value: "#1cf69e" },
      { kind: "component" as const, name: "ProductCard" },
    ];
    expect(splitMentions("make @ProductCard use --color-accent.", references)).toEqual([
      { text: "make " },
      { text: "@ProductCard", mention: true },
      { text: " use " },
      { text: "--color-accent", mention: true },
      { text: "." },
    ]);
    expect(splitMentions("plain")).toEqual([{ text: "plain" }]);
    // Typed in another case, still the mention.
    expect(splitMentions("like @productcard", references)).toEqual([{ text: "like " }, { text: "@productcard", mention: true }]);
  });
});
