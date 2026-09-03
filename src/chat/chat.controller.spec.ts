import { Reflector } from '@nestjs/core';
import { REQUIRE_ROLE_KEY } from '../files/require-role.decorator';
import { ChatController } from './chat.controller';

describe('ChatController route roles', () => {
  it('requires COMMENTER to list messages', () => {
    const reflector = new Reflector();
    const role = reflector.get(REQUIRE_ROLE_KEY, ChatController.prototype.list);
    expect(role).toBe('COMMENTER');
  });
});
