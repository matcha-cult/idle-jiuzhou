import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PlayerName from '../PlayerName';

describe('PlayerName', () => {
  it('未激活月卡时不应附加特效 class', () => {
    const html = renderToStaticMarkup(<PlayerName name="青玄" />);
    expect(html).toContain('game-player-name__text');
    expect(html).not.toContain('is-month-card-active');
  });

  it('激活月卡时应附加特效 class，并保留称号结构', () => {
    const html = renderToStaticMarkup(
      <PlayerName name="青玄" title="道友" monthCardActive />,
    );

    expect(html).toContain('game-player-name__title');
    expect(html).toContain('道友');
    expect(html).toContain('is-month-card-active');
  });
});
