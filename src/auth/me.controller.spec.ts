import { MeController } from './me.controller';

describe('MeController', () => {
  it('returns the current userId', () => {
    const controller = new MeController();
    expect(controller.getMe('user_123')).toEqual({ userId: 'user_123' });
  });
});
