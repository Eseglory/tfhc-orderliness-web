import { Test, TestingModule } from '@nestjs/testing';
import { ServicesService } from '../src/modules/services/services.service';
import { AppointmentsService } from '../src/modules/appointments/appointments.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ServiceCategory, AppointmentStatus, AppointmentMode } from '@prisma/client';
import { ConflictException } from '@nestjs/common';

describe('Services & Appointments Domain Integration Tests', () => {
  let servicesService: ServicesService;
  let appointmentsService: AppointmentsService;

  const servicesStore = new Map<string, any>();
  const appointmentsStore = new Map<string, any>();

  const mockPrisma = {
    organizationService: {
      findMany: jest.fn().mockImplementation(() => {
        return Promise.resolve(Array.from(servicesStore.values()));
      }),
      count: jest.fn().mockImplementation(() => {
        return Promise.resolve(servicesStore.size);
      }),
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.id) return Promise.resolve(servicesStore.get(where.id) || null);
        if (where.name) {
          for (const s of servicesStore.values()) {
            if (s.name === where.name) return Promise.resolve(s);
          }
        }
        return Promise.resolve(null);
      }),
      create: jest.fn().mockImplementation(({ data }) => {
        const id = `srv-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
        const record = { id, ...data, createdAt: new Date(), updatedAt: new Date(), _count: { appointments: 0 } };
        servicesStore.set(id, record);
        return Promise.resolve(record);
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const existing = servicesStore.get(where.id);
        if (!existing) return Promise.resolve(null);
        const updated = { ...existing, ...data, updatedAt: new Date() };
        servicesStore.set(where.id, updated);
        return Promise.resolve(updated);
      }),
      delete: jest.fn().mockImplementation(({ where }) => {
        const existing = servicesStore.get(where.id);
        servicesStore.delete(where.id);
        return Promise.resolve(existing);
      }),
    },
    appointment: {
      findFirst: jest.fn().mockImplementation(({ where }) => {
        for (const a of appointmentsStore.values()) {
          if (where.id?.not && a.id === where.id.not) continue;
          if (where.providerId && a.providerId === where.providerId) {
            if (a.status !== AppointmentStatus.CANCELLED) {
              const startA = new Date(a.startTime).getTime();
              const endA = new Date(a.endTime).getTime();
              const reqLt = where.startTime?.lt ? new Date(where.startTime.lt).getTime() : Infinity;
              const reqGt = where.endTime?.gt ? new Date(where.endTime.gt).getTime() : -Infinity;
              if (startA < reqLt && endA > reqGt) {
                return Promise.resolve(a);
              }
            }
          }
        }
        return Promise.resolve(null);
      }),
      findMany: jest.fn().mockImplementation(({ where }) => {
        const list = Array.from(appointmentsStore.values());
        if (where?.providerId) return Promise.resolve(list.filter((a) => a.providerId === where.providerId));
        return Promise.resolve(list);
      }),
      count: jest.fn().mockImplementation(() => Promise.resolve(appointmentsStore.size)),
      findUnique: jest.fn().mockImplementation(({ where }) => {
        const item = appointmentsStore.get(where.id);
        if (item) {
          const service = item.serviceId ? servicesStore.get(item.serviceId) : null;
          return Promise.resolve({ ...item, service });
        }
        return Promise.resolve(null);
      }),
      create: jest.fn().mockImplementation(({ data }) => {
        const id = `app-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
        const record = { id, ...data, referenceCode: `APP-${Date.now()}`, createdAt: new Date(), updatedAt: new Date() };
        appointmentsStore.set(id, record);
        const service = record.serviceId ? servicesStore.get(record.serviceId) : null;
        return Promise.resolve({ ...record, service });
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const existing = appointmentsStore.get(where.id);
        if (!existing) return Promise.resolve(null);
        const updated = { ...existing, ...data, updatedAt: new Date() };
        appointmentsStore.set(where.id, updated);
        const service = updated.serviceId ? servicesStore.get(updated.serviceId) : null;
        return Promise.resolve({ ...updated, service });
      }),
      delete: jest.fn().mockImplementation(({ where }) => {
        const existing = appointmentsStore.get(where.id);
        appointmentsStore.delete(where.id);
        return Promise.resolve(existing);
      }),
    },
    member: {
      findUnique: jest.fn().mockResolvedValue({ id: 'mem-1', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServicesService,
        AppointmentsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    servicesService = module.get<ServicesService>(ServicesService);
    appointmentsService = module.get<AppointmentsService>(AppointmentsService);
  });

  describe('Services Catalog Management', () => {
    let createdServiceId: string;

    it('should create an organization service offering', async () => {
      const uniqueName = `Executive Advisory Session ${Date.now()}`;
      const service = await servicesService.create({
        name: uniqueName,
        description: 'High-level strategic consultation',
        category: ServiceCategory.ADVISORY,
        durationMinutes: 45,
        price: 0,
        capacity: 1,
        isBookable: true,
        active: true,
        locationType: AppointmentMode.IN_PERSON,
        defaultLocation: 'Room 401',
      });

      expect(service.id).toBeDefined();
      expect(service.name).toBe(uniqueName);
      expect(service.durationMinutes).toBe(45);
      createdServiceId = service.id;
    });

    it('should list services from catalog', async () => {
      const res = await servicesService.findAll();
      expect(res.items).toBeDefined();
      expect(res.total).toBeGreaterThanOrEqual(1);
    });

    it('should update service offering details', async () => {
      const updated = await servicesService.update(createdServiceId, {
        durationMinutes: 60,
        instructions: 'Arrive 5 minutes prior to session',
      });

      expect(updated.durationMinutes).toBe(60);
      expect(updated.instructions).toBe('Arrive 5 minutes prior to session');
    });

    it('should toggle service active state', async () => {
      const toggled = await servicesService.toggleStatus(createdServiceId, false);
      expect(toggled.active).toBe(false);

      const reToggled = await servicesService.toggleStatus(createdServiceId, true);
      expect(reToggled.active).toBe(true);
    });
  });

  describe('Appointments & Concurrency-Safe Booking', () => {
    let createdAppointmentId: string;
    const testProviderId = 'provider-lead-1';
    const testStartTime = new Date();
    testStartTime.setDate(testStartTime.getDate() + 2); // 2 days in future
    testStartTime.setHours(10, 0, 0, 0);

    it('should successfully book an appointment', async () => {
      const appointment = await appointmentsService.create({
        title: 'Strategy Consultation with Lead',
        clientName: 'Jane Doe',
        clientEmail: 'jane@example.com',
        providerId: testProviderId,
        providerName: 'Senior Consultant',
        startTime: testStartTime.toISOString(),
        durationMinutes: 45,
        mode: AppointmentMode.VIDEO_CONFERENCE,
        notes: 'Initial strategic session',
      });

      expect(appointment.id).toBeDefined();
      expect(appointment.status).toBe(AppointmentStatus.CONFIRMED);
      expect(appointment.providerId).toBe(testProviderId);
      expect(appointment.referenceCode).toBeDefined();
      createdAppointmentId = appointment.id;
    });

    it('should reject a conflicting booking for the same provider (double-booking prevention)', async () => {
      const overlappingStartTime = new Date(testStartTime.getTime() + 15 * 60 * 1000); // 15 mins into the 45-min slot

      await expect(
        appointmentsService.create({
          title: 'Conflicting Booking Attempt',
          clientName: 'Second Client',
          clientEmail: 'second@example.com',
          providerId: testProviderId,
          providerName: 'Senior Consultant',
          startTime: overlappingStartTime.toISOString(),
          durationMinutes: 30,
          mode: AppointmentMode.IN_PERSON,
        })
      ).rejects.toThrow(ConflictException);
    });

    it('should query availability slots correctly', async () => {
      const dateStr = testStartTime.toISOString().split('T')[0];
      const availability = await appointmentsService.getAvailability(dateStr, testProviderId, 30);
      expect(availability.slots).toBeDefined();
      expect(availability.date).toBe(dateStr);
    });

    it('should update appointment status', async () => {
      const updated = await appointmentsService.updateStatus(
        createdAppointmentId,
        AppointmentStatus.COMPLETED,
        'Session finished on schedule'
      );
      expect(updated.status).toBe(AppointmentStatus.COMPLETED);
    });
  });
});
