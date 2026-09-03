import { PATH_METADATA, METHOD_METADATA, GUARDS_METADATA } from '@nestjs/common/constants';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { LoadLocalUserGuard } from '../auth/load-local-user.guard';
import { REQUIRE_ROLE_KEY } from './require-role.decorator';
import { ALLOW_DELETED_KEY } from './allow-deleted.decorator';

// Route-ordering regression guard. NestJS resolves controller routes by
// walking the prototype's own property names in declaration order — the
// same guarantee JS gives for string keys on a class body — so the order
// this test observes is exactly the order Nest matches requests against
// at runtime. A literal path like 'starred'/'trash' declared AFTER the
// ':id' handler is silently unreachable (':id' matches first and 404s
// resolving a file literally named "starred"). This has been flagged as
// the single most load-bearing correctness constraint on this controller
// throughout the Dashboard Shell sub-project's plan and every task
// review — this test is what stops a future refactor from reintroducing
// it without any test catching it (tsc/build/service-level tests all
// stay green even if this regresses).
describe('FilesController route declaration order', () => {
  const methodOrder = Object.getOwnPropertyNames(FilesController.prototype).filter(
    (name) => name !== 'constructor',
  );

  function indexOf(methodName: string): number {
    const index = methodOrder.indexOf(methodName);
    expect(index).toBeGreaterThanOrEqual(0); // fails loudly if the method itself is missing/renamed
    return index;
  }

  it("declares the literal 'starred' route before the ':id' route", () => {
    expect(indexOf('starred')).toBeLessThan(indexOf('get'));
  });

  it("declares the literal 'trash' route before the ':id' route", () => {
    expect(indexOf('trash')).toBeLessThan(indexOf('get'));
  });

  it("sanity-checks the path metadata actually attached to each handler, so this test can't pass by coincidentally matching unrelated method names", () => {
    expect(Reflect.getMetadata(PATH_METADATA, FilesController.prototype.starred)).toBe('starred');
    expect(Reflect.getMetadata(PATH_METADATA, FilesController.prototype.trash)).toBe('trash');
    expect(Reflect.getMetadata(PATH_METADATA, FilesController.prototype.get)).toBe(':id');
    // All three are GET handlers — the method (not just the path) has to
    // match for Nest to even consider a route a candidate.
    expect(Reflect.getMetadata(METHOD_METADATA, FilesController.prototype.starred)).toBe(0); // RequestMethod.GET
    expect(Reflect.getMetadata(METHOD_METADATA, FilesController.prototype.trash)).toBe(0);
    expect(Reflect.getMetadata(METHOD_METADATA, FilesController.prototype.get)).toBe(0);
  });
});

// Guard-chain regression guard for the permanent-delete route — pairs with
// files.service.spec.ts's behavioral test that permanentDelete itself
// requires deletedAt: { not: null }. This test pins the two decorators
// that are supposed to get a request to that service method in the first
// place: drop either one and this fails even though the service-level
// test and the build stay green.
describe('FilesController permanentDelete guard chain', () => {
  it('requires OWNER role', () => {
    expect(Reflect.getMetadata(REQUIRE_ROLE_KEY, FilesController.prototype.permanentDelete)).toBe('OWNER');
  });

  it('allows resolving access to an already-deleted file (@AllowDeleted)', () => {
    expect(Reflect.getMetadata(ALLOW_DELETED_KEY, FilesController.prototype.permanentDelete)).toBe(true);
  });
});

describe('FilesController star/unstar role requirement', () => {
  it('star requires only VIEWER role (starring needs read access, not edit/own access)', () => {
    expect(Reflect.getMetadata(REQUIRE_ROLE_KEY, FilesController.prototype.star)).toBe('VIEWER');
  });

  it('unstar requires only VIEWER role', () => {
    expect(Reflect.getMetadata(REQUIRE_ROLE_KEY, FilesController.prototype.unstar)).toBe('VIEWER');
  });
});

describe('FilesController#get', () => {
  const filesServiceMock = {};

  function buildController() {
    return new FilesController(filesServiceMock as unknown as FilesService);
  }

  it('get succeeds anonymously for a file with generalAccess ANYONE, always as VIEWER', () => {
    // Build the controller directly (guards are unit-tested separately;
    // this exercises FilesController#get's own logic against a
    // CurrentFileAccess value FileAccessGuard would have attached).
    const controller = buildController();
    const access = { file: { id: 'f1', name: 'Doc' }, role: 'VIEWER' as const };

    const result = controller.get(access as never);

    expect(result).toEqual({ id: 'f1', name: 'Doc', role: 'VIEWER' });
  });
});

// Anonymous-access guard-wiring regression guard. Task 3 relaxed the
// class-level guards to OptionalClerkAuthGuard/OptionalLoadLocalUserGuard so
// GET /files/:id can run without a session — but every other route on this
// controller must still fail closed with no token, exactly as before. This
// test pins the ClerkAuthGuard/LoadLocalUserGuard pair back onto every
// non-`get` handler via @UseGuards' own metadata, so a future edit that
// forgets to re-declare them on a route is caught here even though
// tsc/build and the service-level tests stay green.
describe('FilesController guard wiring (anonymous access only for GET /files/:id)', () => {
  const guardedMethods = [
    'list',
    'create',
    'shared',
    'starred',
    'trash',
    'update',
    'generalAccess',
    'remove',
    'restore',
    'permanentDelete',
    'star',
    'unstar',
  ] as const;

  it('every mutating/list route still requires auth (ClerkAuthGuard + LoadLocalUserGuard are explicitly re-declared, not relying on the now-optional class guards)', () => {
    for (const method of guardedMethods) {
      const guards = Reflect.getMetadata(GUARDS_METADATA, FilesController.prototype[method]);
      expect(guards).toEqual(expect.arrayContaining([ClerkAuthGuard, LoadLocalUserGuard]));
    }
  });

  it("get's only guard is FileAccessGuard, relying on the optional class-level guards for anonymous access", () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, FilesController.prototype.get);
    expect(guards).not.toEqual(expect.arrayContaining([ClerkAuthGuard]));
    expect(guards).not.toEqual(expect.arrayContaining([LoadLocalUserGuard]));
  });
});
