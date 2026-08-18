import { NotificationsGateway, notificationRoom } from './notifications.gateway';

function createClient(data: Record<string, unknown> = { userId: 'clerk_1', localUserId: 'local_1' }) {
  return {
    data,
    join: jest.fn(),
  } as any;
}

describe('NotificationsGateway', () => {
  let gateway: NotificationsGateway;

  beforeEach(() => {
    gateway = new NotificationsGateway();
  });

  describe('join-notifications', () => {
    it("joins the caller's own personal notification room", () => {
      const client = createClient();

      gateway.handleJoinNotifications(client);

      expect(client.join).toHaveBeenCalledWith(notificationRoom('local_1'));
    });
  });

  describe('notificationRoom', () => {
    it('is keyed by the local user id', () => {
      expect(notificationRoom('local_1')).toBe('user:local_1');
      expect(notificationRoom('local_2')).toBe('user:local_2');
    });
  });
});
