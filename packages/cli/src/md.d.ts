/** Markdown files bundled as text (tsup's text loader, see tsup.config.ts). */
declare module "*.md" {
  const text: string;
  export default text;
}
