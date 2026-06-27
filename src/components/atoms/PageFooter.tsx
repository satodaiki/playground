import type { ReactNode } from 'react';

// ページ下部のフッタ。文言は children、スタイルは className で各ページのスコープに合わせる。
export default function PageFooter({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return <footer className={className}>{children}</footer>;
}
