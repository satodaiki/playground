import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import SlidesLink from '@/components/atoms/SlidesLink';
import { SLIDES_URL } from '@/lib/links';

describe('SlidesLink', () => {
  it('発表資料へ新規タブで開く安全なリンクを描画する', () => {
    render(<SlidesLink className="x" />);
    const link = screen.getByRole('link', { name: /発表資料/ });
    expect(link).toHaveAttribute('href', SLIDES_URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveClass('x');
  });

  it('label を上書きできる', () => {
    render(<SlidesLink label="資料を見る" />);
    expect(screen.getByRole('link', { name: '資料を見る' })).toBeInTheDocument();
  });
});
