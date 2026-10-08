/** HTML + CSS as one paste-ready snippet: the markup followed by a <style> block. */
export function fullSnippet(html: string, css: string): string {
  if (!css.trim()) return html;
  return `${html}\n\n<style>\n${css}\n</style>`;
}

const escapeText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A complete HTML document that renders the element on its own (for "Download .html"). */
export function standaloneDocument(html: string, css: string, title: string): string {
  const indent = (s: string) =>
    s
      .split('\n')
      .map((line) => (line ? `    ${line}` : line))
      .join('\n');
  return [
    '<!doctype html>',
    '<html lang="en">',
    '  <head>',
    '    <meta charset="utf-8">',
    '    <meta name="viewport" content="width=device-width, initial-scale=1">',
    `    <title>${escapeText(title)}</title>`,
    '    <style>',
    indent(css),
    '    </style>',
    '  </head>',
    '  <body>',
    indent(html),
    '  </body>',
    '</html>',
    '',
  ].join('\n');
}

/** Safe file name part from an element label like `div.card.md:flex`. */
export function fileSlug(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'element'
  );
}
