import { MembersController } from '../src/modules/members/members.controller';
import { ChatService, compactPhotoUrl } from '../src/modules/chat/chat.service';

describe('Profile photos in chat', () => {
  it('allows the public photo to render on the separate frontend origin and revalidate after edits', async () => {
    const photo = { buffer: Buffer.from('photo'), contentType: 'image/webp' };
    const members = { getPhotoBuffer: jest.fn().mockResolvedValue(photo) };
    const controller = new MembersController(members as any, {} as any, {} as any);
    const response = { setHeader: jest.fn(), send: jest.fn() };
    await controller.getMemberPhoto('member', response as any);
    expect(response.setHeader).toHaveBeenCalledWith('Cross-Origin-Resource-Policy', 'cross-origin');
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, no-cache');
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'image/webp');
    expect(response.send).toHaveBeenCalledWith(photo.buffer);
  });

  it('does not turn absent photos into successful image responses', async () => {
    const controller = new MembersController({ getPhotoBuffer: jest.fn().mockResolvedValue(null) } as any, {} as any, {} as any);
    await expect(controller.getMemberPhoto('member', {} as any)).rejects.toThrow('Photo not found');
  });

  it('keeps uploaded photo data out of contact-list payloads', async () => {
    const image = 'data:image/webp;base64,' + 'a'.repeat(100000);
    const members = Array.from({ length: 100 }, (_, i) => ({ id: `m${i}`, firstName: 'Member', lastName: String(i), profilePhotoUrl: image }));
    const service = Object.create(ChatService.prototype) as ChatService;
    (service as any).prisma = { member: { findMany: jest.fn().mockResolvedValue(members) } };
    const result = await service.contacts({ userId: 'u', memberId: 'me', role: 'MEMBER', permissions: [] });
    expect(result[0].photoUrl).toMatch(/^\/members\/m0\/photo\?v=[a-f0-9]{16}$/);
    expect(JSON.stringify(result)).not.toContain('base64');
    expect(JSON.stringify(result).length).toBeLessThan(20000);
  });

  it('preserves external photos and members without uploaded photos', () => {
    expect(compactPhotoUrl('m', 'https://images.example.test/photo.jpg')).toBe('https://images.example.test/photo.jpg');
    expect(compactPhotoUrl('m', null)).toBeNull();
  });

  it('changes the image URL when an uploaded photo is replaced', () => {
    const first = compactPhotoUrl('m', 'data:image/webp;base64,YQ==');
    expect(first).toBe(compactPhotoUrl('m', 'data:image/webp;base64,YQ=='));
    expect(first).not.toBe(compactPhotoUrl('m', 'data:image/webp;base64,Yg=='));
  });
});
