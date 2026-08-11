jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://minio.local/signed-url'),
}));

import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageService } from './storage.service';

describe('StorageService', () => {
  beforeEach(() => {
    process.env.S3_BUCKET = 'infinite-draw-assets';
    process.env.S3_ENDPOINT = 'http://localhost:9000';
    process.env.S3_ACCESS_KEY = 'minioadmin';
    process.env.S3_SECRET_KEY = 'minioadmin';
  });

  it('returns a presigned upload URL', async () => {
    const service = new StorageService();
    jest.spyOn(service, 'ensureBucket').mockResolvedValue(undefined);

    const url = await service.getPresignedUploadUrl('files/abc.png', 'image/png');

    expect(url).toBe('https://minio.local/signed-url');
    expect(getSignedUrl).toHaveBeenCalled();
  });
});
