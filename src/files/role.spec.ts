import { ROLE_RANK } from './role';

describe('ROLE_RANK', () => {
  it('orders VIEWER < COMMENTER < EDITOR < OWNER', () => {
    expect(ROLE_RANK.VIEWER).toBeLessThan(ROLE_RANK.COMMENTER);
    expect(ROLE_RANK.COMMENTER).toBeLessThan(ROLE_RANK.EDITOR);
    expect(ROLE_RANK.EDITOR).toBeLessThan(ROLE_RANK.OWNER);
  });
});
