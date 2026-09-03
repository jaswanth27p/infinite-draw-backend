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

  it('kind: image derives an images/ key with the extension matching contentType, and passes contentType through to the presign call', async () => {
    const storageServiceMock = {
      getPresignedUploadUrl: jest.fn().mockResolvedValue('https://minio.local/signed'),
      getPublicUrl: jest.fn().mockReturnValue('https://minio.local/public'),
    } as unknown as StorageService;
    const controller = new StorageController(storageServiceMock);

    const result = await controller.presign({ fileId: 'f1', kind: 'image', contentType: 'image/webp' });

    expect(result).toEqual({
      uploadUrl: 'https://minio.local/signed',
      key: expect.stringMatching(/^images\/f1\/[a-f0-9-]+\.webp$/),
      publicUrl: 'https://minio.local/public',
    });
    expect(storageServiceMock.getPresignedUploadUrl).toHaveBeenCalledWith(
      expect.stringMatching(/^images\/f1\/[a-f0-9-]+\.webp$/),
      'image/webp',
    );
  });

  it('kind: image derives a distinct key on every call (no overwrite between two images in the same file)', async () => {
    const storageServiceMock = {
      getPresignedUploadUrl: jest.fn().mockResolvedValue('https://minio.local/signed'),
      getPublicUrl: jest.fn().mockReturnValue('https://minio.local/public'),
    } as unknown as StorageService;
    const controller = new StorageController(storageServiceMock);

    const first = await controller.presign({ fileId: 'f1', kind: 'image', contentType: 'image/png' });
    const second = await controller.presign({ fileId: 'f1', kind: 'image', contentType: 'image/png' });

    expect(first.key).not.toEqual(second.key);
  });
});
