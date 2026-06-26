import { cn } from '@/lib/utils';
import { memo, useMemo, type ReactNode } from 'react';

const KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
  'async', 'await', 'import', 'export', 'from', 'type', 'interface', 'class',
  'extends', 'new', 'try', 'catch', 'throw', 'true', 'false', 'null',
  'undefined', 'sudo', 'chown', 'chmod', 'find', 'exec', 'grep', 'cd', 'cp',
  'mv', 'rm', 'mkdir', 'docker', 'bun', 'npm', 'git'
]);

const TOKEN_PATTERN = /("(?:\\.|[^"])*"|'(?:\\.|[^'])*'|`(?:\\.|[^`])*`|#.*$|\b\d+(?:\.\d+)?\b|--?[A-Za-z0-9][\w-]*|\$\{?[A-Za-z_][\w]*\}?|\\;|[{}()[\];]|\b[A-Za-z_][\w:-]*\b)/g;

type TCodeBlockProps = {
  code: string;
  language?: string;
  inline?: boolean;
};

const tokenClassName = (token: string) => {
  if (token.startsWith('#')) return 'text-zinc-500 italic';
  if (/^("|'|`)/.test(token)) return 'text-emerald-300';
  if (/^\d/.test(token)) return 'text-orange-400';
  if (/^--?/.test(token)) return 'text-violet-300';
  if (/^\$/.test(token)) return 'text-cyan-300';
  if (/^\\;$/.test(token)) return 'text-zinc-400';
  if (/^[{}()[\];]$/.test(token)) return 'text-zinc-400';
  if (KEYWORDS.has(token)) return 'text-sky-300 font-semibold';
  return 'text-zinc-100';
};

const highlightLine = (line: string, lineIndex: number): ReactNode[] => {
  const nodes: ReactNode[] = [];
  let last = 0;

  line.replace(TOKEN_PATTERN, (match, _unused, offset) => {
    if (offset > last) nodes.push(line.slice(last, offset));
    nodes.push(
      <span className={tokenClassName(match)} key={`${lineIndex}-${offset}`}>
        {match}
      </span>
    );
    last = offset + match.length;
    return match;
  });

  if (last < line.length) nodes.push(line.slice(last));

  return nodes;
};

const CodeBlock = memo(({ code, language, inline }: TCodeBlockProps) => {
  const lines = useMemo(() => code.replace(/\n$/, '').split('\n'), [code]);
  const highlightedLines = useMemo(
    () => lines.map((line, index) => highlightLine(line, index)),
    [lines]
  );

  if (inline) {
    return (
      <code className="rounded bg-zinc-900/80 px-1 py-0.5 font-mono text-[0.9em] text-zinc-100">
        {code}
      </code>
    );
  }

  return (
    <pre className="not-prose my-2 max-w-full overflow-x-auto rounded-lg border border-zinc-800 bg-[#0b0d12] py-3 text-sm leading-6 shadow-sm">
      <code
        className={cn('block min-w-max font-mono', language && `language-${language}`)}
        data-language={language || undefined}
      >
        {highlightedLines.map((tokens, index) => (
          <span className="grid grid-cols-[3rem_1fr]" key={index}>
            <span className="select-none border-r border-zinc-700/70 pr-3 text-right text-zinc-500">
              {index + 1}
            </span>
            <span className="pl-4 pr-5 whitespace-pre">{tokens.length ? tokens : ' '}</span>
          </span>
        ))}
      </code>
    </pre>
  );
});

export { CodeBlock };
