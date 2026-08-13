import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FileAccessGuard } from './file-access.guard';
import { FilesService } from './files.service';
import { REQUIRE_ROLE_KEY } from './require-role.decorator';
import { ALLOW_DELETED_KEY } from './allow-deleted.decorator';

function buildContext(overrides: {
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  localUserId?: string;
  handlerRole?: string;
  classRole?: string;
}) {
  const request: Record<string, unknown> = {
    params: overrides.params ?? {},
    body: overrides.body ?? {},
    localUserId: overrides.localUserId ?? 'user_1',
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({ __handlerRole: overrides.handlerRole }),
    getClass: () => ({ __classRole: overrides.classRole }),
  } as never;
}

describe('FileAccessGuard', () => {
  const filesServiceMock = { getAccess: jest.fn() };
  const reflectorMock = { getAllAndOverride: jest.fn() };

  function buildGuard() {
    return new FileAccessGuard(
      filesServiceMock as unknown as FilesService,
      reflectorMock as unknown as Reflector,
    );
  }

  beforeEach(() => jest.clearAllMocks());

  it('reads fileId from params.id, checks access, and attaches it to the request', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue('VIEWER');
    filesServiceMock.getAccess.mockResolvedValue({ file: { id: 'f1' }, role: 'OWNER' });
    const request: Record<string, unknown> = { params: { id: 'f1' }, body: {}, localUserId: 'user_1' };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as never;

    await expect(buildGuard().canActivate(context)).resolves.toBe(true);
    expect(filesServiceMock.getAccess).toHaveBeenCalledWith('f1', 'user_1', expect.any(Object));
    expect(request.fileAccess).toEqual({ file: { id: 'f1' }, role: 'OWNER' });
  });

  it('falls back to params.fileId, then body.fileId, when params.id is absent', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue('EDITOR');
    filesServiceMock.getAccess.mockResolvedValue({ file: { id: 'f2' }, role: 'EDITOR' });
    const request: Record<string, unknown> = { params: {}, body: { fileId: 'f2' }, localUserId: 'user_1' };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as never;

    await expect(buildGuard().canActivate(context)).resolves.toBe(true);
    expect(filesServiceMock.getAccess).toHaveBeenCalledWith('f2', 'user_1', expect.any(Object));
  });

  it('throws NotFoundException when getAccess returns null', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue('VIEWER');
    filesServiceMock.getAccess.mockResolvedValue(null);
    const request: Record<string, unknown> = { params: { id: 'f1' }, body: {}, localUserId: 'user_1' };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as never;

    await expect(buildGuard().canActivate(context)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws ForbiddenException when the resolved role is below the required floor', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue('EDITOR');
    filesServiceMock.getAccess.mockResolvedValue({ file: { id: 'f1' }, role: 'VIEWER' });
    const request: Record<string, unknown> = { params: { id: 'f1' }, body: {}, localUserId: 'user_1' };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as never;

    await expect(buildGuard().canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('defaults the required floor to OWNER when no @RequireRole is declared', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue(undefined);
    filesServiceMock.getAccess.mockResolvedValue({ file: { id: 'f1' }, role: 'EDITOR' });
    const request: Record<string, unknown> = { params: { id: 'f1' }, body: {}, localUserId: 'user_1' };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as never;

    await expect(buildGuard().canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws NotFoundException without calling getAccess when fileId is absent from both params and body', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue('VIEWER');
    const request: Record<string, unknown> = { params: {}, body: {}, localUserId: 'user_1' };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as never;

    await expect(buildGuard().canActivate(context)).rejects.toBeInstanceOf(NotFoundException);
    expect(filesServiceMock.getAccess).not.toHaveBeenCalled();
  });

  it('throws NotFoundException without calling getAccess when body.fileId is not a string (e.g. an injected Prisma filter object)', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue('EDITOR');
    const request: Record<string, unknown> = {
      params: {},
      body: { fileId: { not: 'x' } },
      localUserId: 'user_1',
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as never;

    await expect(buildGuard().canActivate(context)).rejects.toBeInstanceOf(NotFoundException);
    expect(filesServiceMock.getAccess).not.toHaveBeenCalled();
  });

  it('reads REQUIRE_ROLE_KEY via getAllAndOverride so class-level and method-level decorators both work', async () => {
    filesServiceMock.getAccess.mockResolvedValue({ file: { id: 'f1' }, role: 'OWNER' });
    reflectorMock.getAllAndOverride.mockReturnValue('OWNER');
    const request: Record<string, unknown> = { params: { id: 'f1' }, body: {}, localUserId: 'user_1' };
    const handler = {};
    const klass = {};
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => handler,
      getClass: () => klass,
    } as never;

    await buildGuard().canActivate(context);

    expect(reflectorMock.getAllAndOverride).toHaveBeenCalledWith(REQUIRE_ROLE_KEY, [handler, klass]);
  });

  it('passes includeDeleted: false to getAccess when @AllowDeleted is not declared', async () => {
    reflectorMock.getAllAndOverride.mockImplementation((key: string) =>
      key === REQUIRE_ROLE_KEY ? 'OWNER' : undefined,
    );
    filesServiceMock.getAccess.mockResolvedValue({ file: { id: 'f1' }, role: 'OWNER' });
    const request: Record<string, unknown> = { params: { id: 'f1' }, body: {}, localUserId: 'user_1' };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as never;

    await buildGuard().canActivate(context);

    expect(filesServiceMock.getAccess).toHaveBeenCalledWith('f1', 'user_1', { includeDeleted: false });
  });

  it('passes includeDeleted: true to getAccess when @AllowDeleted() is declared on the handler (e.g. restore)', async () => {
    reflectorMock.getAllAndOverride.mockImplementation((key: string) =>
      key === REQUIRE_ROLE_KEY ? 'OWNER' : key === ALLOW_DELETED_KEY ? true : undefined,
    );
    filesServiceMock.getAccess.mockResolvedValue({ file: { id: 'f1', deletedAt: new Date() }, role: 'OWNER' });
    const request: Record<string, unknown> = { params: { id: 'f1' }, body: {}, localUserId: 'user_1' };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as never;

    await buildGuard().canActivate(context);

    expect(filesServiceMock.getAccess).toHaveBeenCalledWith('f1', 'user_1', { includeDeleted: true });
  });
});
