import { useMemo } from 'preact/hooks';
import { tokenizeCss, tokenizeHtml, tokenizeJs, type Token } from './highlight';

// Above this size, highlighting thousands of spans costs more than it helps.
const HIGHLIGHT_LIMIT = 60_000;

const TOKENIZERS = { html: tokenizeHtml, css: tokenizeCss, js: tokenizeJs };

export function CodeView({ code, language }: { code: string; language: keyof typeof TOKENIZERS }) {
  const tokens = useMemo<Token[]>(() => {
    if (code.length > HIGHLIGHT_LIMIT) return [{ text: code, kind: 'text' }];
    return TOKENIZERS[language](code);
  }, [code, language]);

  return (
    <pre class="el-code" tabIndex={0}>
      <code>
        {tokens.map((t, i) =>
          t.kind === 'text' ? t.text : (
            <span key={i} class={`tk-${t.kind}`}>
              {t.text}
            </span>
          ),
        )}
      </code>
    </pre>
  );
}
