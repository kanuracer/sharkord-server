import { cn } from '@/lib/utils';
import { memo, useMemo, type ReactNode } from 'react';

const KEYWORDS = /\b(const|let|var|function|return|if|else|for|while|async|await|import|export|from|type|interface|class|extends|new|try|catch|throw|true|false|null|undefined)\b/g;

type TCodeBlockProps = {
  code: string;
  language?: string;
  inline?: boolean;
};

const highlight = (code: string): ReactNode[] => {
  const nodes: ReactNode[] = [];
  let last = 0;

  code.replace(KEYWORDS, (match, offset) => {
    if (offset > last) nodes.push(code.slice(last, offset));
    nodes.push(<span className="text-sky-400 font-semibold" key={`kw-${offset}`}>{match}</span>);
    last = offset + match.length;
    return match;
  });

  if (last < code.length) nodes.push(code.slice(last));

  return nodes;
};

const CodeBlock = memo(({ code, language, inline }: TCodeBlockProps) => {
  const highlighted = useMemo(() => highlight(code), [code]);

  if (inline) {
    return <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">{code}</code>;
  }

  return (
    <pre className="my-2 max-w-full overflow-x-auto rounded-lg border bg-muted/70 p-3 text-sm leading-relaxed">
      <code
        className={cn('font-mono', language && `language-${language}`)}
        data-language={language || undefined}
      >
        {highlighted}
      </code>
    </pre>
  );
});

export { CodeBlock };
