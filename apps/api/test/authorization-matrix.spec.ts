import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import {
  AUTHORIZED_PERSONS,
  assertFinanceCrudAuthority,
  assertWardrobeCreateAuthority,
  assertEventCreateAuthority,
  assertFundExpenseApprovalAuthority,
  assertAbsenceApprovalAuthority,
  isFinanceCrudAuthorized,
  isWardrobeCreateAuthorized,
  isEventCreateAuthorized,
  isFundExpenseApprovalAuthorized,
  isAbsenceApprovalAuthorized,
} from '../src/common/rbac/authorization-rules';

describe('TFHC-ORDERLINESS Authorization Matrix Rules', () => {
  const eseosaUser = {
    userId: 'eseosa-id',
    email: 'engreseglory@gmail.com',
    role: 'ADMIN',
    isSuperAdmin: true,
  };

  const danielUser = {
    userId: 'daniel-id',
    email: 'danoguamanam@gmail.com',
    role: 'ADMIN',
    isSuperAdmin: false,
  };

  const jacobUser = {
    userId: 'jacob-id',
    email: 'onojamonday123@gmail.com',
    role: 'MEMBER',
    isSuperAdmin: false,
  };

  const lovethUser = {
    userId: 'loveth-id',
    email: 'ngoziloveth41@gmail.com',
    role: 'MEMBER',
    isSuperAdmin: false,
  };

  const aanuUser = {
    userId: 'aanu-id',
    email: 'aanuoyeniran@gmail.com',
    role: 'ADMIN',
    isSuperAdmin: false,
  };

  const victoriaUser = {
    userId: 'victoria-id',
    email: 'olarenwajuvictoria@gmail.com',
    role: 'ADMIN',
    isSuperAdmin: false,
  };

  const confortUser = {
    userId: 'confort-id',
    email: 'comfort.osariroya@gmail.com',
    role: 'ADMIN',
    isSuperAdmin: false,
  };

  const pasedaUser = {
    userId: 'paseda-id',
    email: 'fpaseda@yahoo.com',
    role: 'ADMIN',
    isSuperAdmin: false,
  };

  const genericExecAdmin = {
    userId: 'exec-id',
    email: 'exec_member@tfhc.church',
    role: 'ADMIN',
    isSuperAdmin: false,
  };

  const genericDisciplinaryAdmin = {
    userId: 'disciplinary-id',
    email: 'disciplinary_member@tfhc.church',
    role: 'ADMIN',
    isSuperAdmin: false,
  };

  const regularMember = {
    userId: 'member-id',
    email: 'member@tfhc.church',
    role: 'MEMBER',
    isSuperAdmin: false,
  };

  describe('1. Platform Owner / Finance Authority Matrix', () => {
    it('Eseosa Glory has full Finance CRUD authority', () => {
      expect(isFinanceCrudAuthorized(eseosaUser)).toBe(true);
      expect(() => assertFinanceCrudAuthority(eseosaUser)).not.toThrow();
    });

    it('Eseosa Glory email check is case-insensitive and trimmed', () => {
      expect(isFinanceCrudAuthorized({ email: '  ENGRESEGLORY@GMAIL.COM  ' })).toBe(true);
    });

    it('Executive Committee admin is DENIED Finance CRUD', () => {
      expect(isFinanceCrudAuthorized(genericExecAdmin)).toBe(false);
      expect(() => assertFinanceCrudAuthority(genericExecAdmin)).toThrow(ForbiddenException);
    });

    it('Disciplinary Committee admin is DENIED Finance CRUD', () => {
      expect(isFinanceCrudAuthorized(genericDisciplinaryAdmin)).toBe(false);
      expect(() => assertFinanceCrudAuthority(genericDisciplinaryAdmin)).toThrow(ForbiddenException);
    });

    it('Loveth is DENIED general Finance CRUD', () => {
      expect(isFinanceCrudAuthorized(lovethUser)).toBe(false);
      expect(() => assertFinanceCrudAuthority(lovethUser)).toThrow(ForbiddenException);
    });

    it('Daniel is DENIED general Finance CRUD', () => {
      expect(isFinanceCrudAuthorized(danielUser)).toBe(false);
      expect(() => assertFinanceCrudAuthority(danielUser)).toThrow(ForbiddenException);
    });
  });

  describe('2. Wardrobe Creation Authority Matrix', () => {
    it('Aanu can create wardrobe records', () => {
      expect(isWardrobeCreateAuthorized(aanuUser)).toBe(true);
      expect(() => assertWardrobeCreateAuthority(aanuUser)).not.toThrow();
    });

    it('Victoria can create wardrobe records', () => {
      expect(isWardrobeCreateAuthorized(victoriaUser)).toBe(true);
      expect(() => assertWardrobeCreateAuthority(victoriaUser)).not.toThrow();
    });

    it('Eseosa Glory as Super Admin can create wardrobe records', () => {
      expect(isWardrobeCreateAuthorized(eseosaUser)).toBe(true);
      expect(() => assertWardrobeCreateAuthority(eseosaUser)).not.toThrow();
    });

    it('Other Executive or Disciplinary admins are DENIED wardrobe creation', () => {
      expect(isWardrobeCreateAuthorized(genericExecAdmin)).toBe(false);
      expect(isWardrobeCreateAuthorized(genericDisciplinaryAdmin)).toBe(false);
      expect(() => assertWardrobeCreateAuthority(genericExecAdmin)).toThrow(ForbiddenException);
      expect(() => assertWardrobeCreateAuthority(genericDisciplinaryAdmin)).toThrow(ForbiddenException);
    });

    it('Regular members are DENIED wardrobe creation', () => {
      expect(isWardrobeCreateAuthorized(regularMember)).toBe(false);
      expect(() => assertWardrobeCreateAuthority(regularMember)).toThrow(ForbiddenException);
    });
  });

  describe('3. Events (Services & Meetings) Creation Authority Matrix', () => {
    it('Confort (Comfort Stephen) can create Services and Meetings', () => {
      expect(isEventCreateAuthorized(confortUser)).toBe(true);
      expect(() => assertEventCreateAuthority(confortUser, 'services')).not.toThrow();
      expect(() => assertEventCreateAuthority(confortUser, 'meetings')).not.toThrow();
    });

    it('Paseda (Oluwafemi Paseda) can create Services and Meetings', () => {
      expect(isEventCreateAuthorized(pasedaUser)).toBe(true);
      expect(() => assertEventCreateAuthority(pasedaUser, 'services')).not.toThrow();
      expect(() => assertEventCreateAuthority(pasedaUser, 'meetings')).not.toThrow();
    });

    it('Eseosa Glory as Super Admin can create Services and Meetings', () => {
      expect(isEventCreateAuthorized(eseosaUser)).toBe(true);
      expect(() => assertEventCreateAuthority(eseosaUser, 'services')).not.toThrow();
    });

    it('Other Executive/Disciplinary admins are DENIED Service/Meeting creation unless authorized', () => {
      expect(isEventCreateAuthorized(genericExecAdmin)).toBe(false);
      expect(isEventCreateAuthorized(genericDisciplinaryAdmin)).toBe(false);
      expect(() => assertEventCreateAuthority(genericExecAdmin, 'services')).toThrow(ForbiddenException);
      expect(() => assertEventCreateAuthority(genericDisciplinaryAdmin, 'meetings')).toThrow(ForbiddenException);
    });
  });

  describe('4. Loveth Fund / Expense Requests & Approvals Matrix', () => {
    it('Loveth can create fund and expense requests (represented by canonical email)', () => {
      expect(lovethUser.email.toLowerCase()).toBe(AUTHORIZED_PERSONS.LOVETH_UBABUIKE);
    });

    it('Loveth is DENIED self-approval on her own requests', () => {
      expect(isFundExpenseApprovalAuthorized(lovethUser, lovethUser)).toBe(false);
      expect(() => assertFundExpenseApprovalAuthority(lovethUser.email, lovethUser)).toThrow(ForbiddenException);
    });

    it('Eseosa Glory is ALLOWED to approve Loveth requests', () => {
      expect(isFundExpenseApprovalAuthorized(eseosaUser, lovethUser)).toBe(true);
      expect(() => assertFundExpenseApprovalAuthority(lovethUser.email, eseosaUser)).not.toThrow();
    });

    it('Daniel is ALLOWED to approve Loveth requests', () => {
      expect(isFundExpenseApprovalAuthorized(danielUser, lovethUser)).toBe(true);
      expect(() => assertFundExpenseApprovalAuthority(lovethUser.email, danielUser)).not.toThrow();
    });

    it('Other Executive/Disciplinary admins are DENIED approval of Loveth requests', () => {
      expect(isFundExpenseApprovalAuthorized(genericExecAdmin, lovethUser)).toBe(false);
      expect(isFundExpenseApprovalAuthorized(genericDisciplinaryAdmin, lovethUser)).toBe(false);
      expect(() => assertFundExpenseApprovalAuthority(lovethUser.email, genericExecAdmin)).toThrow(ForbiddenException);
      expect(() => assertFundExpenseApprovalAuthority(lovethUser.email, genericDisciplinaryAdmin)).toThrow(ForbiddenException);
    });
  });

  describe("5. Jacob's Requests — Daniel Only Matrix", () => {
    it('Daniel is ALLOWED to approve Jacob requests', () => {
      expect(isAbsenceApprovalAuthorized(danielUser, jacobUser)).toBe(true);
      expect(() => assertAbsenceApprovalAuthority(jacobUser.email, danielUser)).not.toThrow();
    });

    it("Other Disciplinary Committee admins are DENIED approval of Jacob's requests", () => {
      expect(isAbsenceApprovalAuthorized(genericDisciplinaryAdmin, jacobUser)).toBe(false);
      expect(() => assertAbsenceApprovalAuthority(jacobUser.email, genericDisciplinaryAdmin)).toThrow(ForbiddenException);
    });

    it("Other Executive admins are DENIED approval of Jacob's requests", () => {
      expect(isAbsenceApprovalAuthorized(genericExecAdmin, jacobUser)).toBe(false);
      expect(() => assertAbsenceApprovalAuthority(jacobUser.email, genericExecAdmin)).toThrow(ForbiddenException);
    });

    it('Disciplinary Committee admins are ALLOWED to approve regular members absence requests', () => {
      expect(isAbsenceApprovalAuthorized(genericDisciplinaryAdmin, regularMember)).toBe(true);
      expect(() => assertAbsenceApprovalAuthority(regularMember.email, genericDisciplinaryAdmin)).not.toThrow();
    });
  });
});
