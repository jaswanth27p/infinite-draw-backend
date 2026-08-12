import { NotFoundException } from '@nestjs/common';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';
import { FilesService } from '../files/files.service';

describe('StorageController', () => {
  const storageServiceMock = {
    getPresignedUploadUrl: jest.fn(),
  } as unknown as StorageService;
  const filesServiceMock = { getOwned: jest.fn() } as unknown as FilesService;

  beforeEach(() => jest.clearAllMocks());

  it('returns a presigned upload URL for a thumbnail key derived from an owned fileId', async () => {
    (filesServiceMock.getOwned as jest.Mock).mockResolvedValue({ id: 'f1' });
    (storageServiceMock.getPresignedUploadUrl as jest.Mock).mockResolvedValue(
      'https://minio.local/signed',
    );
    const controller = new StorageController(storageServiceMock, filesServiceMock);

    const result = await controller.presign({ fileId: 'f1' }, 'owner_1');

    expect(result).toEqual({ uploadUrl: 'https://minio.local/signed' });
    expect(filesServiceMock.getOwned).toHaveBeenCalledWith('f1', 'owner_1');
    expect(storageServiceMock.getPresignedUploadUrl).toHaveBeenCalledWith(
      'thumbnails/f1.png',
      'image/png',
    );
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
