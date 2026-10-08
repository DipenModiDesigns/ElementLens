// Tiny tokenizers for the HTML and CSS we generate ourselves. Output is rendered as
// Preact elements, never as innerHTML, so page content can never inject markup.

export type TokenKind =
  | 'tag' | 'attr' | 'value' | 'comment' | 'punct' | 'selector' | 'prop' | 'text' | 'keyword' | 'number';
export interface Token {
  text: string;
  kind: TokenKind;
}

const TAG_OPEN = /<\/?[^\s>/]+/y;
const TAG_END = /\s*\/?>/y;
// Values: quoted, JSX expressions ({...} or {{ ... }}), or bare.
const ATTR = /(\s+)([^\s=>/]+)(?:(=)("[^"]*"|'[^']*'|\{\{[\s\S]*?\}\}|\{[^}]*\}|[^\s>]+))?/y;

function match(re: RegExp, code: string, at: number): RegExpExecArray | null {
  re.lastIndex = at;
  return re.exec(code);
}

export function tokenizeHtml(code: string): Token[] {
  const tokens: Token[] = [];
  const push = (text: string | undefined, kind: TokenKind) => {
    if (text) tokens.push({ text, kind });
  };
  let i = 0;

  while (i < code.length) {
    if (code.startsWith('<!--', i)) {
      const end = code.indexOf('-->', i);
      const j = end === -1 ? code.length : end + 3;
      push(code.slice(i, j), 'comment');
      i = j;
      continue;
    }

    const open = code[i] === '<' ? match(TAG_OPEN, code, i) : null;
    if (open) {
      push(open[0], 'tag');
      i += open[0].length;
      while (i < code.length) {
        const end = match(TAG_END, code, i);
        if (end) {
          push(end[0], 'tag');
          i += end[0].length;
          break;
        }
        const attr = match(ATTR, code, i);
        if (!attr) break;
        push(attr[1], 'text');
        push(attr[2], 'attr');
        push(attr[3], 'punct');
        push(attr[4], 'value');
        i += attr[0].length;
      }
      continue;
    }

    const next = code.indexOf('<', i + 1);
    const j = next === -1 ? code.length : next;
    push(code.slice(i, j), 'text');
    i = j;
  }
  return tokens;
}

export function tokenizeCss(code: string): Token[] {
  const tokens: Token[] = [];
  for (const line of code.split(/(?<=\n)/)) {
    const body = line.replace(/\n$/, '');
    const nl = line.endsWith('\n') ? '\n' : '';
    const decl = /^(\s*)([\w-]+)(:\s*)(.*?)(;?)$/.exec(body);

    if (/^\s*\/\*.*\*\/\s*$/.test(body)) {
      tokens.push({ text: line, kind: 'comment' });
    } else if (body.trimEnd().endsWith('{')) {
      tokens.push({ text: body.replace(/\s*\{\s*$/, ''), kind: 'selector' }, { text: ` {${nl}`, kind: 'punct' });
    } else if (body.trim() === '}') {
      tokens.push({ text: line, kind: 'punct' });
    } else if (decl) {
      tokens.push(
        { text: decl[1] ?? '', kind: 'text' },
        { text: decl[2] ?? '', kind: 'prop' },
        { text: decl[3] ?? '', kind: 'punct' },
        { text: decl[4] ?? '', kind: 'value' },
        { text: (decl[5] ?? '') + nl, kind: 'punct' },
      );
    } else {
      tokens.push({ text: line, kind: 'text' });
    }
  }
  return tokens;
}

const JS_TOKEN =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(async|await|break|case|catch|class|const|continue|default|delete|else|export|extends|false|finally|for|function|if|import|in|instanceof|let|new|null|of|return|switch|this|throw|true|try|typeof|undefined|var|void|while|yield)\b|\b(\d+(?:\.\d+)?)\b/g;

/** Good-enough JavaScript highlighting: comments, strings, keywords, numbers. */
export function tokenizeJs(code: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  for (const m of code.matchAll(JS_TOKEN)) {
    if (m.index > last) tokens.push({ text: code.slice(last, m.index), kind: 'text' });
    const kind: TokenKind = m[1] ? 'comment' : m[2] ? 'value' : m[3] ? 'keyword' : 'number';
    tokens.push({ text: m[0], kind });
    last = m.index + m[0].length;
  }
  if (last < code.length) tokens.push({ text: code.slice(last), kind: 'text' });
  return tokens;
}
