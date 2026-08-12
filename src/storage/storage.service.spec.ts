jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://minio.local/signed-url'),
}));

import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageService } from './storage.service';

describe('StorageService', () => {
  beforeEach(() => {
    process.env.S3_BUCKET = 'infinite-draw-assets';
    process.env.S3_ENDPOINT = 'http://localhost:9000';
    process.env.S3_ACCESS_KEY = 'minioadmin';
    process.env.S3_SECRET_KEY = 'minioadmin';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns a presigned upload URL', async () => {
    const service = new StorageService();
    jest.spyOn(service, 'ensureBucket').mockResolvedValue(undefined);

    const url = await service.getPresignedUploadUrl('files/abc.png', 'image/png');

    expect(url).toBe('https://minio.local/signed-url');
    expect(getSignedUrl).toHaveBeenCalled();
  });

  describe('ensureBucket', () => {
    it('creates the bucket when HeadBucket reports NotFound', async () => {
      const notFound = Object.assign(new Error('Not Found'), {
        name: 'NotFound',
        $metadata: { httpStatusCode: 404 },
      });

      const sendSpy = jest
        .spyOn(S3Client.prototype, 'send')
        .mockImplementation((command: unknown) => {
          if (command instanceof HeadBucketCommand) {
            return Promise.reject(notFound);
          }
          if (command instanceof CreateBucketCommand) {
            return Promise.resolve({});
          }
          if (command instanceof PutBucketPolicyCommand) {
            return Promise.resolve({});
          }
          return Promise.reject(new Error(`unexpected command: ${String(command)}`));
        });

      const service = new StorageService();

      await expect(service.ensureBucket()).resolves.toBeUndefined();

      expect(sendSpy).toHaveBeenCalledTimes(3);
      expect(sendSpy.mock.calls[0][0]).toBeInstanceOf(HeadBucketCommand);
      expect(sendSpy.mock.calls[1][0]).toBeInstanceOf(CreateBucketCommand);
      expect(sendSpy.mock.calls[2][0]).toBeInstanceOf(PutBucketPolicyCommand);
    });

    it('rethrows non-NotFound errors without attempting to create the bucket', async () => {
      const authError = Object.assign(new Error('Forbidden'), {
        name: 'Unknown',
        $metadata: { httpStatusCode: 403 },
      });

      const sendSpy = jest
        .spyOn(S3Client.prototype, 'send')
        .mockImplementation((command: unknown) => {
          if (command instanceof HeadBucketCommand) {
            return Promise.reject(authError);
          }
          return Promise.reject(new Error('CreateBucket should not have been called'));
        });

      const service = new StorageService();

      await expect(service.ensureBucket()).rejects.toBe(authError);

      expect(sendSpy).toHaveBeenCalledTimes(1);
    });

    it('sets a bucket policy granting anonymous read access scoped to thumbnails/* only, every time (idempotent)', async () => {
      const sendSpy = jest
        .spyOn(S3Client.prototype, 'send')
        .mockImplementation((command: unknown) => {
          if (command instanceof HeadBucketCommand) {
            // Bucket already exists — the policy must still be (re)applied.
            return Promise.resolve({});
          }
          if (command instanceof PutBucketPolicyCommand) {
            return Promise.resolve({});
          }
          return Promise.reject(new Error(`unexpected command: ${String(command)}`));
        });

      const service = new StorageService();

      await service.ensureBucket();

      const policyCall = sendSpy.mock.calls.find(
        ([command]) => command instanceof PutBucketPolicyCommand,
      );
      expect(policyCall).toBeDefined();

      const policyCommand = policyCall![0] as PutBucketPolicyCommand;
      expect(policyCommand.input.Bucket).toBe('infinite-draw-assets');

      const policy = JSON.parse(policyCommand.input.Policy as string);
      expect(policy.Statement).toHaveLength(1);
      expect(policy.Statement[0]).toMatchObject({
        Effect: 'Allow',
        Principal: '*',
        Action: expect.arrayContaining(['s3:GetObject']),
        Resource: ['arn:aws:s3:::infinite-draw-assets/thumbnails/*'],
      });
    });
  });
});
