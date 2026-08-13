import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';

describe('StorageController', () => {
  it('derives a unique key per call and returns the presigned upload URL plus the public URL', async () => {
    const storageServiceMock = {
      getPresignedUploadUrl: jest.fn().mockResolvedValue('https://minio.local/signed'),
      getPublicUrl: jest.fn().mockReturnValue('https://minio.local/public'),
    } as unknown as StorageService;
    const controller = new StorageController(storageServiceMock);

    const result = await controller.presign({ fileId: 'f1' });

    expect(result).toEqual({
      uploadUrl: 'https://minio.local/signed',
      key: expect.stringMatching(/^thumbnails\/f1\/\d+\.png$/),
      publicUrl: 'https://minio.local/public',
    });
    expect(storageServiceMock.getPresignedUploadUrl).toHaveBeenCalledWith(
      expect.stringMatching(/^thumbnails\/f1\/\d+\.png$/),
      'image/png',
    );
  });
});
