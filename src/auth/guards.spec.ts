import 'reflect-metadata';
import { FilesController } from '../files/files.controller';
import { FileVersionsController } from '../files/file-versions.controller';
import { StorageController } from '../storage/storage.controller';
import { ClerkAuthGuard } from './clerk-auth.guard';
import { LoadLocalUserGuard } from './load-local-user.guard';

// The plan's core security constraint is that every file/version/storage
// endpoint sits behind both ClerkAuthGuard and LoadLocalUserGuard — enforced
// today only by `@UseGuards(...)` decorators on each controller. Deleting one
// of those decorators would leave every other test in the suite green, since
// nothing else exercises the guard wiring itself. This reflects on the
// controllers' guard metadata directly so that regression is caught here.
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
