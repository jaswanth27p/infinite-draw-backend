import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';

describe('StorageController', () => {
  it('returns a presigned upload URL for the given key and content type', async () => {
    const storageServiceMock = {
      getPresignedUploadUrl: jest.fn().mockResolvedValue('https://minio.local/signed'),
    } as unknown as StorageService;
    const controller = new StorageController(storageServiceMock);

    const result = await controller.presign({ key: 'thumbnails/f1.png', contentType: 'image/png' });

    expect(result).toEqual({ uploadUrl: 'https://minio.local/signed' });
    expect(storageServiceMock.getPresignedUploadUrl).toHaveBeenCalledWith(
      'thumbnails/f1.png',
      'image/png',
    );
  });
});
