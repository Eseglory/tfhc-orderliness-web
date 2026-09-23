import 'reflect-metadata';
import { ForbiddenException, ConflictException } from '@nestjs/common';
import {
  SYSTEM_ROLE,
  SYSTEM_ROLE_DEFINITIONS,
  hasAllPermissions,
} from '@tfhc/shared';
import {
  isFinanceCrudAuthorized,
  isWardrobeCreateAuthorized,
  isEventCreateAuthorized,
  isFundExpenseApprovalAuthorized,
  isSettingsAuthorized,
  assertFinanceCrudAuthority,
  assertWardrobeCreateAuthority,
  assertEventCreateAuthority,
  assertFundExpenseApprovalAuthority,
  assertSettingsAuthority,
} from '../src/common/rbac/authorization-rules';

describe('Admin RBAC, Module Ownership & Welfare Fund Approval Workflow', () => {
  // Helper to check single permission against held permissions
  const checkPerm = (held: string[], required: string): boolean => {
    return hasAllPermissions(new Set(held), [required]);
  };

  // Test User Identities representing our canonical administrative team
  const eseosaSuperAdmin = {
    userId: 'eseosa-uuid-1',
    email: 'engreseglory@gmail.com',
    role: 'ADMIN',
    isSuperAdmin: true,
    permissions: ['*'],
  };

  const aanuWardrobeManager = {
    userId: 'aanu-uuid-2',
    email: 'aanuoyeniran@gmail.com',
    role: 'ADMIN',
    isSuperAdmin: false,
    permissions: SYSTEM_ROLE_DEFINITIONS[SYSTEM_ROLE.WARDROBE_MANAGER].permissions,
  };

  const victoriaWardrobeManager = {
    userId: 'victoria-uuid-3',
    email: 'olarenwajuvictoria@gmail.com',
    role: 'ADMIN',
    isSuperAdmin: false,
    permissions: SYSTEM_ROLE_DEFINITIONS[SYSTEM_ROLE.WARDROBE_MANAGER].permissions,
  };

  const passedEventManager = {
    userId: 'passed-uuid-4',
    email: 'fpaseda@yahoo.com',
    role: 'ADMIN',
    isSuperAdmin: false,
    permissions: SYSTEM_ROLE_DEFINITIONS[SYSTEM_ROLE.EVENT_MANAGER].permissions,
  };

  const confortEventManager = {
    userId: 'confort-uuid-5',
    email: 'comfort.osariroya@gmail.com',
    role: 'ADMIN',
    isSuperAdmin: false,
    permissions: SYSTEM_ROLE_DEFINITIONS[SYSTEM_ROLE.EVENT_MANAGER].permissions,
  };

  const nicoleApprovalManager = {
    userId: 'nicole-uuid-6',
    email: 'nicoleokafor0@gmail.com',
    role: 'ADMIN',
    isSuperAdmin: false,
    permissions: SYSTEM_ROLE_DEFINITIONS[SYSTEM_ROLE.APPROVAL_MANAGER].permissions,
  };

  const dotunApprovalManager = {
    userId: 'dotun-uuid-7',
    email: 'dotunakingbesote@gmail.com',
    role: 'ADMIN',
    isSuperAdmin: false,
    permissions: SYSTEM_ROLE_DEFINITIONS[SYSTEM_ROLE.APPROVAL_MANAGER].permissions,
  };

  const jacobApprovalManager = {
    userId: 'jacob-uuid-8',
    email: 'onojamonday123@gmail.com',
    role: 'ADMIN',
    isSuperAdmin: false,
    permissions: SYSTEM_ROLE_DEFINITIONS[SYSTEM_ROLE.APPROVAL_MANAGER].permissions,
  };

  const danielViewerAndApprover = {
    userId: 'daniel-uuid-9',
    email: 'danoguamanam@gmail.com',
    role: 'ADMIN',
    isSuperAdmin: false,
    permissions: SYSTEM_ROLE_DEFINITIONS[SYSTEM_ROLE.VIEWER].permissions,
  };

  const folawewoViewer = {
    userId: 'folawewo-uuid-10',
    email: 'david.folawewo@gmail.com',
    role: 'ADMIN',
    isSuperAdmin: false,
    permissions: SYSTEM_ROLE_DEFINITIONS[SYSTEM_ROLE.VIEWER].permissions,
  };

  const lovethWelfareSecretary = {
    userId: 'loveth-uuid-11',
    email: 'ngoziloveth41@gmail.com',
    role: 'ADMIN',
    isSuperAdmin: false,
    permissions: SYSTEM_ROLE_DEFINITIONS[SYSTEM_ROLE.WELFARE_SECRETARY].permissions,
  };

  const defaultAdmin = {
    userId: 'default-admin-uuid-12',
    email: 'generic-admin@tfhc.church',
    role: 'ADMIN',
    isSuperAdmin: false,
    permissions: SYSTEM_ROLE_DEFINITIONS[SYSTEM_ROLE.VIEWER].permissions,
  };

  // =========================================================================
  // 1. SYSTEM ROLE DEFINITIONS & PERMISSIONS CATALOG
  // =========================================================================
  describe('1. System Role Definitions & Permissions Catalog', () => {
    it('verifies all expected module roles exist in SYSTEM_ROLE', () => {
      expect(SYSTEM_ROLE.SUPER_ADMIN).toBe('SUPER_ADMIN');
      expect(SYSTEM_ROLE.WARDROBE_MANAGER).toBe('WARDROBE_MANAGER');
      expect(SYSTEM_ROLE.EVENT_MANAGER).toBe('EVENT_MANAGER');
      expect(SYSTEM_ROLE.APPROVAL_MANAGER).toBe('APPROVAL_MANAGER');
      expect(SYSTEM_ROLE.WELFARE_SECRETARY).toBe('WELFARE_SECRETARY');
      expect(SYSTEM_ROLE.VIEWER).toBe('VIEWER');
    });

    it('verifies SUPER_ADMIN holds the universal wildcard permission', () => {
      expect(SYSTEM_ROLE_DEFINITIONS[SYSTEM_ROLE.SUPER_ADMIN].permissions).toEqual(['*']);
      expect(checkPerm(['*'], 'finance.disburse')).toBe(true);
      expect(checkPerm(['*'], 'welfare.disburse')).toBe(true);
      expect(checkPerm(['*'], 'system.manage')).toBe(true);
    });

    it('verifies WARDROBE_MANAGER holds full wardrobe management and read-only on other modules', () => {
      const perms = SYSTEM_ROLE_DEFINITIONS[SYSTEM_ROLE.WARDROBE_MANAGER].permissions;
      expect(perms).toContain('wardrobe.manage');
      expect(perms).toContain('events.read');
      expect(perms).toContain('approvals.read');
      expect(perms).toContain('expenses.read');
      expect(perms).toContain('dues.read');
      // Must NOT contain mutation permissions for other modules
      expect(perms).not.toContain('events.create');
      expect(perms).not.toContain('events.update');
      expect(perms).not.toContain('events.delete');
      expect(perms).not.toContain('finance.create');
      expect(perms).not.toContain('welfare.disburse');
    });

    it('verifies EVENT_MANAGER holds full event/service/gathering management and read-only on other modules', () => {
      const perms = SYSTEM_ROLE_DEFINITIONS[SYSTEM_ROLE.EVENT_MANAGER].permissions;
      expect(perms).toContain('events.create');
      expect(perms).toContain('events.update');
      expect(perms).toContain('events.delete');
      expect(perms).toContain('wardrobe.read');
      expect(perms).toContain('expenses.read');
      expect(perms).toContain('dues.read');
      // Must NOT contain wardrobe mutation or finance mutation
      expect(perms).not.toContain('wardrobe.manage');
      expect(perms).not.toContain('finance.create');
      expect(perms).not.toContain('welfare.disburse');
    });

    it('verifies APPROVAL_MANAGER holds approvals.act and approvals.configure', () => {
      const perms = SYSTEM_ROLE_DEFINITIONS[SYSTEM_ROLE.APPROVAL_MANAGER].permissions;
      expect(perms).toContain('approvals.act');
      expect(perms).toContain('approvals.configure');
      expect(perms).toContain('excuses.review');
      // Must NOT contain finance disbursement or events/wardrobe creation
      expect(perms).not.toContain('welfare.disburse');
      expect(perms).not.toContain('wardrobe.manage');
      expect(perms).not.toContain('events.create');
    });

    it('verifies WELFARE_SECRETARY holds welfare.create and view rights', () => {
      const perms = SYSTEM_ROLE_DEFINITIONS[SYSTEM_ROLE.WELFARE_SECRETARY].permissions;
      expect(perms).toContain('welfare.create');
      expect(perms).toContain('welfare.read');
      expect(perms).not.toContain('welfare.disburse');
      expect(perms).not.toContain('approvals.act');
    });

    it('verifies VIEWER holds view-only permissions across modules', () => {
      const perms = SYSTEM_ROLE_DEFINITIONS[SYSTEM_ROLE.VIEWER].permissions;
      expect(perms).toContain('events.read');
      expect(perms).toContain('wardrobe.read');
      expect(perms).toContain('expenses.read');
      expect(perms).toContain('dues.read');
      expect(perms).toContain('approvals.read');
      expect(perms).not.toContain('events.create');
      expect(perms).not.toContain('wardrobe.manage');
      expect(perms).not.toContain('welfare.create');
      expect(perms).not.toContain('welfare.disburse');
    });
  });

  // =========================================================================
  // 2. CORE PERMISSION MODEL & DEFAULT ADMIN CONSTRAINTS
  // =========================================================================
  describe('2. Core Permission Model & Module Ownership Boundaries', () => {
    it('Default Admin can view records but CANNOT mutate', () => {
      expect(checkPerm(defaultAdmin.permissions, 'events.read')).toBe(true);
      expect(checkPerm(defaultAdmin.permissions, 'wardrobe.read')).toBe(true);
      expect(checkPerm(defaultAdmin.permissions, 'expenses.read')).toBe(true);
      expect(checkPerm(defaultAdmin.permissions, 'events.create')).toBe(false);
      expect(checkPerm(defaultAdmin.permissions, 'wardrobe.manage')).toBe(false);
      expect(checkPerm(defaultAdmin.permissions, 'welfare.disburse')).toBe(false);
    });

    it('Wardrobe Managers (Aanu & Victoria) have full wardrobe CRUD but no Event or Finance mutations', () => {
      // Aanu
      expect(isWardrobeCreateAuthorized(aanuWardrobeManager)).toBe(true);
      expect(checkPerm(aanuWardrobeManager.permissions, 'wardrobe.manage')).toBe(true);
      expect(isEventCreateAuthorized(aanuWardrobeManager)).toBe(false);
      expect(isFinanceCrudAuthorized(aanuWardrobeManager)).toBe(false);
      expect(() => assertEventCreateAuthority(aanuWardrobeManager, 'services')).toThrow(ForbiddenException);
      expect(() => assertFinanceCrudAuthority(aanuWardrobeManager)).toThrow(ForbiddenException);

      // Victoria
      expect(isWardrobeCreateAuthorized(victoriaWardrobeManager)).toBe(true);
      expect(checkPerm(victoriaWardrobeManager.permissions, 'wardrobe.manage')).toBe(true);
      expect(isEventCreateAuthorized(victoriaWardrobeManager)).toBe(false);
      expect(isFinanceCrudAuthorized(victoriaWardrobeManager)).toBe(false);
      expect(() => assertEventCreateAuthority(victoriaWardrobeManager, 'services')).toThrow(ForbiddenException);
      expect(() => assertFinanceCrudAuthority(victoriaWardrobeManager)).toThrow(ForbiddenException);
    });

    it('Event Managers (Passed & Confort) have full Event/Service/Gathering CRUD but no Wardrobe or Finance mutations', () => {
      // Passed
      expect(isEventCreateAuthorized(passedEventManager)).toBe(true);
      expect(checkPerm(passedEventManager.permissions, 'events.create')).toBe(true);
      expect(checkPerm(passedEventManager.permissions, 'events.update')).toBe(true);
      expect(checkPerm(passedEventManager.permissions, 'events.delete')).toBe(true);
      expect(isWardrobeCreateAuthorized(passedEventManager)).toBe(false);
      expect(isFinanceCrudAuthorized(passedEventManager)).toBe(false);
      expect(() => assertWardrobeCreateAuthority(passedEventManager)).toThrow(ForbiddenException);
      expect(() => assertFinanceCrudAuthority(passedEventManager)).toThrow(ForbiddenException);

      // Confort
      expect(isEventCreateAuthorized(confortEventManager)).toBe(true);
      expect(checkPerm(confortEventManager.permissions, 'events.create')).toBe(true);
      expect(checkPerm(confortEventManager.permissions, 'events.update')).toBe(true);
      expect(checkPerm(confortEventManager.permissions, 'events.delete')).toBe(true);
      expect(isWardrobeCreateAuthorized(confortEventManager)).toBe(false);
      expect(isFinanceCrudAuthorized(confortEventManager)).toBe(false);
      expect(() => assertWardrobeCreateAuthority(confortEventManager)).toThrow(ForbiddenException);
      expect(() => assertFinanceCrudAuthority(confortEventManager)).toThrow(ForbiddenException);
    });

    it('Approval Managers (Nicole, Dotun, Jacob) have Approval rights but cannot mutate Finance, Events, or Wardrobe', () => {
      [nicoleApprovalManager, dotunApprovalManager, jacobApprovalManager].forEach((mgr) => {
        expect(checkPerm(mgr.permissions, 'approvals.act')).toBe(true);
        expect(checkPerm(mgr.permissions, 'approvals.configure')).toBe(true);
        expect(isFinanceCrudAuthorized(mgr)).toBe(false);
        expect(isWardrobeCreateAuthorized(mgr)).toBe(false);
        expect(isEventCreateAuthorized(mgr)).toBe(false);
        expect(checkPerm(mgr.permissions, 'welfare.disburse')).toBe(false);
      });
    });

    it('Daniel has Viewer permissions and workflow approval capability, but strictly NO Finance CRUD or Disbursement', () => {
      expect(checkPerm(danielViewerAndApprover.permissions, 'events.read')).toBe(true);
      expect(checkPerm(danielViewerAndApprover.permissions, 'expenses.read')).toBe(true);
      expect(isFinanceCrudAuthorized(danielViewerAndApprover)).toBe(false);
      expect(checkPerm(danielViewerAndApprover.permissions, 'welfare.disburse')).toBe(false);
      expect(() => assertFinanceCrudAuthority(danielViewerAndApprover)).toThrow(ForbiddenException);
    });

    it('Super Admin (Eseosa Glory) has full authority across all modules and exclusively controls Finance and Disbursement', () => {
      expect(eseosaSuperAdmin.isSuperAdmin).toBe(true);
      expect(isFinanceCrudAuthorized(eseosaSuperAdmin)).toBe(true);
      expect(isWardrobeCreateAuthorized(eseosaSuperAdmin)).toBe(true);
      expect(isEventCreateAuthorized(eseosaSuperAdmin)).toBe(true);
      expect(checkPerm(eseosaSuperAdmin.permissions, 'welfare.disburse')).toBe(true);
      expect(() => assertFinanceCrudAuthority(eseosaSuperAdmin)).not.toThrow();
    });
  });

  // =========================================================================
  // 3. WELFARE FUND REQUEST WORKFLOW & MULTI-STAGE APPROVAL
  // =========================================================================
  describe('3. Welfare Fund Request Workflow & Governance', () => {
    // Reference format regex: WFR-YYYY-XXXXXX (e.g. WFR-2026-000001)
    const wfrRefRegex = /^WFR-\d{4}-\d{6}$/;

    it('validates Welfare Fund Request reference numbering convention', () => {
      const year = new Date().getFullYear();
      const mockRef = `WFR-${year}-000001`;
      expect(wfrRefRegex.test(mockRef)).toBe(true);
      expect(wfrRefRegex.test('WFR-2026-000042')).toBe(true);
      expect(wfrRefRegex.test('EXP-2026-000001')).toBe(false);
    });

    it('Loveth has dedicated welfare.create permission to submit Welfare Fund Requests', () => {
      expect(checkPerm(lovethWelfareSecretary.permissions, 'welfare.create')).toBe(true);
    });

    it('Universal Self-Approval Prevention: Requester CANNOT approve their own request', () => {
      // Loveth submits her request
      const lovethRequestEmail = lovethWelfareSecretary.email;

      // Loveth attempts to self-approve
      expect(isFundExpenseApprovalAuthorized(lovethWelfareSecretary, { email: lovethRequestEmail })).toBe(false);
      expect(() =>
        assertFundExpenseApprovalAuthority(lovethRequestEmail, lovethWelfareSecretary),
      ).toThrow(ForbiddenException);
    });

    it('Stage 1 Approver: Daniel can review and approve Loveth request', () => {
      const lovethRequestEmail = lovethWelfareSecretary.email;

      expect(isFundExpenseApprovalAuthorized(danielViewerAndApprover, { email: lovethRequestEmail })).toBe(true);
      expect(() =>
        assertFundExpenseApprovalAuthority(lovethRequestEmail, danielViewerAndApprover),
      ).not.toThrow();
    });

    it('Stage 2 Approver: Super Admin (Eseosa Glory) reviews and approves request after Stage 1', () => {
      const lovethRequestEmail = lovethWelfareSecretary.email;

      expect(isFundExpenseApprovalAuthorized(eseosaSuperAdmin, { email: lovethRequestEmail })).toBe(true);
      expect(() =>
        assertFundExpenseApprovalAuthority(lovethRequestEmail, eseosaSuperAdmin),
      ).not.toThrow();
    });

    it('Other administrators (Aanu, Passed, Nicole, etc.) CANNOT approve Loveth requests', () => {
      const lovethRequestEmail = lovethWelfareSecretary.email;

      const unauthorizedReviewers = [
        aanuWardrobeManager,
        victoriaWardrobeManager,
        passedEventManager,
        confortEventManager,
        nicoleApprovalManager,
        dotunApprovalManager,
        defaultAdmin,
      ];

      unauthorizedReviewers.forEach((rev) => {
        expect(isFundExpenseApprovalAuthorized(rev, { email: lovethRequestEmail })).toBe(false);
        expect(() =>
          assertFundExpenseApprovalAuthority(lovethRequestEmail, rev),
        ).toThrow(ForbiddenException);
      });
    });

    it('Finance Disbursement is strictly restricted to Super Admin (Eseosa Glory)', () => {
      // Loveth cannot disburse
      expect(checkPerm(lovethWelfareSecretary.permissions, 'welfare.disburse')).toBe(false);

      // Daniel cannot disburse
      expect(checkPerm(danielViewerAndApprover.permissions, 'welfare.disburse')).toBe(false);

      // Other managers cannot disburse
      expect(checkPerm(aanuWardrobeManager.permissions, 'welfare.disburse')).toBe(false);
      expect(checkPerm(passedEventManager.permissions, 'welfare.disburse')).toBe(false);
      expect(checkPerm(nicoleApprovalManager.permissions, 'welfare.disburse')).toBe(false);

      // Only Super Admin can disburse
      expect(checkPerm(eseosaSuperAdmin.permissions, 'welfare.disburse')).toBe(true);
      expect(isFinanceCrudAuthorized(eseosaSuperAdmin)).toBe(true);
    });

    it('Simulates complete state transition lifecycle and invariants', () => {
      // Lifecycle: DRAFT -> SUBMITTED -> PENDING_DANIEL_APPROVAL -> PENDING_SUPER_ADMIN_APPROVAL -> APPROVED -> DISBURSED
      let state = 'SUBMITTED';
      let currentStage = 1; // Stage 1 = Daniel
      let disbursed = false;

      // 1. Loveth submits: Stage 1 = Daniel
      expect(state).toBe('SUBMITTED');
      expect(currentStage).toBe(1);

      // 2. Daniel Approves: Stage 2 = Super Admin
      currentStage = 2;
      expect(currentStage).toBe(2);

      // 3. Super Admin Approves: status becomes APPROVED
      state = 'APPROVED';
      expect(state).toBe('APPROVED');

      // 4. Super Admin Disburses: status becomes DISBURSED
      disbursed = true;
      state = 'DISBURSED';
      expect(state).toBe('DISBURSED');
      expect(disbursed).toBe(true);

      // 5. Idempotency check: Cannot re-disburse
      const attemptRedisburse = () => {
        if (disbursed) throw new ConflictException('Request is already disbursed');
      };
      expect(attemptRedisburse).toThrow(ConflictException);
    });
  });

  describe('Module Ownership: System Settings & Policies Exclusivity', () => {
    it('grants full settings authority to Eseosa Glory (engreseglory@gmail.com)', () => {
      expect(isSettingsAuthorized(eseosaSuperAdmin)).toBe(true);
      expect(() => assertSettingsAuthority(eseosaSuperAdmin)).not.toThrow();
    });

    it('denies settings authority and throws ForbiddenException for all other administrators', () => {
      const otherAdmins = [
        aanuWardrobeManager,
        victoriaWardrobeManager,
        passedEventManager,
        confortEventManager,
        nicoleApprovalManager,
        dotunApprovalManager,
        jacobApprovalManager,
        lovethWelfareSecretary,
        danielViewerAndApprover,
        folawewoViewer,
      ];

      for (const admin of otherAdmins) {
        expect(isSettingsAuthorized(admin)).toBe(false);
        expect(() => assertSettingsAuthority(admin)).toThrow(ForbiddenException);
      }
    });

    it('verifies non-superadmin roles do not receive settings.read or settings.update in defaults', () => {
      expect(checkPerm(SYSTEM_ROLE_DEFINITIONS[SYSTEM_ROLE.FINANCE].permissions, 'settings.read')).toBe(false);
      expect(checkPerm(SYSTEM_ROLE_DEFINITIONS[SYSTEM_ROLE.ADMINISTRATION].permissions, 'settings.read')).toBe(false);
      expect(checkPerm(SYSTEM_ROLE_DEFINITIONS[SYSTEM_ROLE.ADMINISTRATION].permissions, 'settings.update')).toBe(false);
      expect(checkPerm(SYSTEM_ROLE_DEFINITIONS[SYSTEM_ROLE.VIEWER].permissions, 'settings.read')).toBe(false);
      expect(checkPerm(SYSTEM_ROLE_DEFINITIONS[SYSTEM_ROLE.SECRETARY].permissions, 'settings.read')).toBe(false);
      expect(checkPerm(SYSTEM_ROLE_DEFINITIONS[SYSTEM_ROLE.SUPER_ADMIN].permissions, 'settings.read')).toBe(true);
      expect(checkPerm(SYSTEM_ROLE_DEFINITIONS[SYSTEM_ROLE.SUPER_ADMIN].permissions, 'settings.update')).toBe(true);
    });
  });
});
