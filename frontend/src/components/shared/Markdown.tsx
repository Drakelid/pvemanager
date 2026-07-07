import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';

// react-markdown передаёт служебный проп `node` — вырезаем его, чтобы он не
// попал на DOM-элемент (иначе React warning про неизвестный атрибут).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function clean(p: any) {
  const { node, ...rest } = p;
  void node;
  return rest;
}

/**
 * Безопасный рендер markdown + встроенного HTML (описания приложений из README
 * сторонних репозиториев). rehype-raw парсит HTML, rehype-sanitize вычищает
 * потенциально опасные теги/атрибуты (защита от XSS).
 */
export function Markdown({ content, className = '' }: { content: string; className?: string }) {
  return (
    <div className={`text-sm leading-relaxed text-foreground/90 ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
        components={{
          h1: (p) => <h1 className="mt-4 mb-2 text-lg font-semibold" {...clean(p)} />,
          h2: (p) => <h2 className="mt-4 mb-2 text-base font-semibold" {...clean(p)} />,
          h3: (p) => <h3 className="mt-3 mb-1.5 text-sm font-semibold" {...clean(p)} />,
          h4: (p) => <h4 className="mt-3 mb-1.5 text-sm font-medium" {...clean(p)} />,
          p: (p) => <p className="my-2" {...clean(p)} />,
          a: (p) => <a target="_blank" rel="noreferrer" className="text-primary hover:underline" {...clean(p)} />,
          img: (p) => <img loading="lazy" className="my-2 max-w-full rounded-md border" {...clean(p)} />,
          ul: (p) => <ul className="my-2 list-disc space-y-1 pl-5" {...clean(p)} />,
          ol: (p) => <ol className="my-2 list-decimal space-y-1 pl-5" {...clean(p)} />,
          li: (p) => <li className="marker:text-muted-foreground" {...clean(p)} />,
          pre: (p) => <pre className="my-2 overflow-x-auto rounded-md bg-muted/60 p-3 text-xs" {...clean(p)} />,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          code: (p: any) => {
            const { node, className: cn, children, ...rest } = p;
            void node;
            const inline = !cn?.includes('language-');
            return inline
              ? <code className="rounded bg-muted px-1.5 py-0.5 text-xs" {...rest}>{children}</code>
              : <code className={`${cn} text-xs`} {...rest}>{children}</code>;
          },
          blockquote: (p) => <blockquote className="my-2 border-l-2 border-border pl-3 text-muted-foreground" {...clean(p)} />,
          table: (p) => <div className="my-2 overflow-x-auto"><table className="w-full text-xs" {...clean(p)} /></div>,
          th: (p) => <th className="border-b px-2 py-1 text-left font-medium" {...clean(p)} />,
          td: (p) => <td className="border-b px-2 py-1" {...clean(p)} />,
          hr: (p) => <hr className="my-3 border-border" {...clean(p)} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
