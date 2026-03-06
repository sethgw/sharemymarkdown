import MarkdownIt from "markdown-it";
import highlightjs from "markdown-it-highlightjs";

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: true,
});

markdown.use(highlightjs, { auto: true, inline: false });

export const renderMarkdown = (source: string) => markdown.render(source || "_Start writing to see the rendered document._");

/** Extract headings for table of contents */
export const extractHeadings = (source: string): { level: number; text: string; id: string }[] => {
  const headings: { level: number; text: string; id: string }[] = [];
  const tokens = markdown.parse(source || "", {});
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === "heading_open") {
      const level = Number.parseInt(token.tag.slice(1), 10);
      const next = tokens[i + 1];
      const text = next?.type === "inline" ? (next.content ?? "") : "";
      const id = text
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-");
      headings.push({ level, text, id });
    }
  }
  return headings;
};

/** Add id attributes to headings for anchor links */
const originalHeadingOpen = markdown.renderer.rules.heading_open;
markdown.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
  const next = tokens[idx + 1];
  if (next?.type === "inline") {
    const id = (next.content ?? "")
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-");
    tokens[idx].attrSet("id", id);
  }
  if (originalHeadingOpen) return originalHeadingOpen(tokens, idx, options, env, self);
  return self.renderToken(tokens, idx, options);
};
