import { SLIDES_URL } from '@/lib/links';

// ハッカソン発表資料（Google スライド）への外部リンク。
// スタイルは各ページのスコープに合わせて className で受ける。
export default function SlidesLink({
  className,
  label = '📊 ハッカソン発表資料',
}: {
  className?: string;
  label?: string;
}) {
  return (
    <a className={className} href={SLIDES_URL} target="_blank" rel="noopener noreferrer">
      {label}
    </a>
  );
}
