export interface Snippet {
  label: string;
  language: string;
  code: string;
}

/** One Markdown document with a fenced block per format, for "Copy all". */
export function toMarkdown(title: string, snippets: Snippet[]): string {
  const sections = snippets
    .filter((s) => s.code.trim())
    .map((s) => {
      // Use a longer fence when the code itself contains ``` (e.g. Markdown in a script).
      const fence = s.code.includes('```') ? '````' : '```';
      return `### ${s.label}\n\n${fence}${s.language}\n${s.code}\n${fence}`;
    });
  return [`## ${title}`, ...sections].join('\n\n') + '\n';
}
