import { NotFoundException } from '@nestjs/common';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';
import { FilesService } from '../files/files.service';

describe('StorageController', () => {
  const storageServiceMock = {
    getPresignedUploadUrl: jest.fn(),
    getPublicUrl: jest.fn(),
  } as unknown as StorageService;
  const filesServiceMock = { getOwned: jest.fn() } as unknown as FilesService;

  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  it('returns a presigned upload URL for a unique per-upload thumbnail key derived from an owned fileId', async () => {
    (filesServiceMock.getOwned as jest.Mock).mockResolvedValue({ id: 'f1' });
    (storageServiceMock.getPresignedUploadUrl as jest.Mock).mockResolvedValue(
      'https://minio.local/signed',
    );
    (storageServiceMock.getPublicUrl as jest.Mock).mockImplementation(
      (key: string) => `https://minio.local/infinite-draw-assets/${key}`,
    );
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const controller = new StorageController(storageServiceMock, filesServiceMock);

    const result = await controller.presign({ fileId: 'f1' }, 'owner_1');

    const expectedKey = 'thumbnails/f1/1700000000000.png';
    expect(filesServiceMock.getOwned).toHaveBeenCalledWith('f1', 'owner_1');
    expect(storageServiceMock.getPresignedUploadUrl).toHaveBeenCalledWith(
      expectedKey,
      'image/png',
    );
    expect(storageServiceMock.getPublicUrl).toHaveBeenCalledWith(expectedKey);
    expect(result).toEqual({
      uploadUrl: 'https://minio.local/signed',
      key: expectedKey,
      publicUrl: `https://minio.local/infinite-draw-assets/${expectedKey}`,
    });
  });

  it('derives a distinct key for each call, so versions never collide on one object', async () => {
    (filesServiceMock.getOwned as jest.Mock).mockResolvedValue({ id: 'f1' });
    (storageServiceMock.getPresignedUploadUrl as jest.Mock).mockResolvedValue('signed');
    (storageServiceMock.getPublicUrl as jest.Mock).mockImplementation((key: string) => key);
    jest
      .spyOn(Date, 'now')
      .mockReturnValueOnce(1_700_000_000_000)
      .mockReturnValueOnce(1_700_000_000_001);
    const controller = new StorageController(storageServiceMock, filesServiceMock);

    const first = await controller.presign({ fileId: 'f1' }, 'owner_1');
    const second = await controller.presign({ fileId: 'f1' }, 'owner_1');

    expect(first.key).not.toBe(second.key);
  });

  it('rejects when the fileId is not owned by the caller, without ever presigning', async () => {
    (filesServiceMock.getOwned as jest.Mock).mockRejectedValue(new NotFoundException());
    const controller = new StorageController(storageServiceMock, filesServiceMock);

    await expect(controller.presign({ fileId: 'not-mine' }, 'owner_1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(storageServiceMock.getPresignedUploadUrl).not.toHaveBeenCalled();
  });
});
