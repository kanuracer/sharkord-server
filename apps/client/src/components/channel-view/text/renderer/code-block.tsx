import { cn } from '@/lib/utils';
import { memo, useMemo } from 'react';

const KEYWORDS = /\b(const|let|var|function|return|if|else|for|while|async|await|import|export|from|type|interface|class|extends|new|try|catch|throw|true|false|null|undefined)\b/g;
const STRINGS = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/g;
const COMMENTS = /(\/\/.*|\/\*[\s\S]*?\*\/|#.*$)/gm;

type TCodeBlockProps = {
  code: string;
  language?: string;
  inline?: boolean;
};

const highlight = (code: string) =>
  code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(COMMENTS, '<span class="text-muted-foreground italic">$1</span>')
    .replace(STRINGS, '<span class="text-emerald-400">$1</span>')
    .replace(KEYWORDS, '<span class="text-sky-400 font-semibold">$1</span>');

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
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    </pre>
  );
});

export { CodeBlock };
