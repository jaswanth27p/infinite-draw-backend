import { SetMetadata } from '@nestjs/common';

export const ALLOW_DELETED_KEY = 'allowDeleted';

/**
 * FileAccessGuard's getAccess() excludes soft-deleted files by default —
 * correct for every read/write route, which should 404 on a deleted file
 * exactly like a nonexistent one. The one exception is
 * FilesController#restore, which by definition must be able to resolve
 * access to a file that *is* currently soft-deleted (by its owner) in order
 * to undelete it. This decorator opts a single route into that exception
 * without changing getAccess's default (deleted-excluding) behavior for
 * everyone else.
 */
export const AllowDeleted = () => SetMetadata(ALLOW_DELETED_KEY, true);
