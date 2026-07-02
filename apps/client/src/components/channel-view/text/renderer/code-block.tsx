import { cn } from '@/lib/utils';
import { memo, useCallback, useMemo, useState, type ReactNode } from 'react';

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
  const [copied, setCopied] = useState(false);
  const lines = useMemo(() => code.replace(/\n$/, '').split('\n'), [code]);
  const highlightedLines = useMemo(
    () => lines.map((line, index) => highlightLine(line, index)),
    [lines]
  );
  const copyCode = useCallback(async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }, [code]);

  if (inline) {
    return (
      <code className="rounded bg-zinc-900/80 px-1 py-0.5 font-mono text-[0.9em] text-zinc-100">
        {code}
      </code>
    );
  }

  return (
    <div className="not-prose relative my-2 max-w-full rounded-lg border border-zinc-800 bg-[#0b0d12] shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2 text-xs text-zinc-400">
        <span className="font-mono uppercase tracking-wide">{language || 'code'}</span>
        <button
          className="rounded-md border border-zinc-700 px-2 py-1 font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
          onClick={copyCode}
          type="button"
        >
          {copied ? 'Copied' : 'Copy code'}
        </button>
      </div>
      <pre className="max-w-full overflow-x-auto py-3 text-sm leading-6">
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
    </div>
  );
});

export { CodeBlock };
