import 'reflect-metadata';
import { FilesController } from '../files/files.controller';
import { FileVersionsController } from '../files/file-versions.controller';
import { StorageController } from '../storage/storage.controller';
import { SharesController } from '../files/shares.controller';
import { ClerkAuthGuard } from './clerk-auth.guard';
import { LoadLocalUserGuard } from './load-local-user.guard';
import { FileAccessGuard } from '../files/file-access.guard';
import { REQUIRE_ROLE_KEY } from '../files/require-role.decorator';

const GUARDS_METADATA_KEY = '__guards__';

describe.each([
  ['FilesController', FilesController],
  ['FileVersionsController', FileVersionsController],
  ['StorageController', StorageController],
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
