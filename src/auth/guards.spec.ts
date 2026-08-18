import 'reflect-metadata';
import { FilesController } from '../files/files.controller';
import { FileVersionsController } from '../files/file-versions.controller';
import { StorageController } from '../storage/storage.controller';
import { SharesController } from '../files/shares.controller';
import { ClerkAuthGuard } from './clerk-auth.guard';
import { LoadLocalUserGuard } from './load-local-user.guard';
import { FileAccessGuard } from '../files/file-access.guard';
import { REQUIRE_ROLE_KEY } from '../files/require-role.decorator';
import { CollabGateway } from '../realtime/collab.gateway';
import { WsClerkGuard } from '../realtime/ws-clerk.guard';
import { WsLocalUserGuard } from '../realtime/ws-local-user.guard';
import { NotificationsController } from '../notifications/notifications.controller';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { ChatController } from '../chat/chat.controller';

const GUARDS_METADATA_KEY = '__guards__';
const WS_GUARDS_METADATA_KEY = '__guards__';

describe.each([
  ['FilesController', FilesController],
  ['FileVersionsController', FileVersionsController],
  ['StorageController', StorageController],
  ['NotificationsController', NotificationsController],
  ['ChatController', ChatController],
])('%s guard wiring', (_name, Controller) => {
  it('is guarded by both ClerkAuthGuard and LoadLocalUserGuard', () => {
    const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA_KEY, Controller) ?? [];

    expect(guards).toContain(ClerkAuthGuard);
    expect(guards).toContain(LoadLocalUserGuard);
  });
});

describe.each([
  [FilesController, 'get', 'VIEWER'],
  [FilesController, 'update', 'EDITOR'],
  [FilesController, 'generalAccess', 'OWNER'],
  [FilesController, 'remove', 'OWNER'],
  [FilesController, 'restore', 'OWNER'],
  [FileVersionsController, 'save', 'EDITOR'],
  [FileVersionsController, 'list', 'VIEWER'],
  [FileVersionsController, 'restore', 'EDITOR'],
  [StorageController, 'presign', 'EDITOR'],
  [ChatController, 'list', 'VIEWER'],
] as const)('file-access floor on %s#%s', (Controller, methodName, expectedRole) => {
  it(`requires FileAccessGuard and RequireRole('${expectedRole}')`, () => {
    const handler = (Controller.prototype as Record<string, unknown>)[methodName];
    const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA_KEY, handler as object) ?? [];
    const role = Reflect.getMetadata(REQUIRE_ROLE_KEY, handler as object);

    expect(guards).toContain(FileAccessGuard);
    expect(role).toBe(expectedRole);
  });
});

describe('SharesController guard wiring', () => {
  it('is guarded by ClerkAuthGuard, LoadLocalUserGuard, and FileAccessGuard with an OWNER floor', () => {
    const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA_KEY, SharesController) ?? [];
    const role = Reflect.getMetadata(REQUIRE_ROLE_KEY, SharesController);

    expect(guards).toContain(ClerkAuthGuard);
    expect(guards).toContain(LoadLocalUserGuard);
    expect(guards).toContain(FileAccessGuard);
    expect(role).toBe('OWNER');
  });
});

describe.each([
  ['join-room', 'handleJoinRoom'],
  ['scene-init', 'handleSceneInit'],
  ['scene-update', 'handleSceneUpdate'],
  ['mouse-location', 'handleMouseLocation'],
  ['idle-status', 'handleIdleStatus'],
  ['send-chat-message', 'handleSendChatMessage'],
] as const)('CollabGateway#%s guard wiring', (_event, methodName) => {
  it(`is guarded by WsClerkGuard and WsLocalUserGuard`, () => {
    const handler = (CollabGateway.prototype as Record<string, unknown>)[methodName];
    const guards: unknown[] = Reflect.getMetadata(WS_GUARDS_METADATA_KEY, handler as object) ?? [];

    expect(guards).toContain(WsClerkGuard);
    expect(guards).toContain(WsLocalUserGuard);
  });
});

describe('NotificationsGateway#join-notifications guard wiring', () => {
  it('is guarded by WsClerkGuard and WsLocalUserGuard', () => {
    const handler = (NotificationsGateway.prototype as Record<string, unknown>)['handleJoinNotifications'];
    const guards: unknown[] = Reflect.getMetadata(WS_GUARDS_METADATA_KEY, handler as object) ?? [];

    expect(guards).toContain(WsClerkGuard);
    expect(guards).toContain(WsLocalUserGuard);
  });
});
