import { Link } from 'wouter';

// 「← トップに戻る」リンク。スタイルは各ページのスコープに合わせて className で受ける。
export default function BackLink({ className }: { className: string }) {
  return (
    <Link href="/">
      <a className={className}>← トップに戻る</a>
    </Link>
  );
}
