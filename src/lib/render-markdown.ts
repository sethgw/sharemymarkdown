import MarkdownIt from "markdown-it";

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: true,
});

export const renderMarkdown = (source: string) => markdown.render(source || "_Start writing to see the rendered document._");
