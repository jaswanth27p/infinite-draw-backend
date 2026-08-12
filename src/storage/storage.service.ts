import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly bucket = process.env.S3_BUCKET as string;
  private readonly client = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY as string,
      secretAccessKey: process.env.S3_SECRET_KEY as string,
    },
  });

  async onModuleInit() {
    await this.ensureBucket();
  }

  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (err) {
      if (!StorageService.isBucketNotFound(err)) {
        throw err;
      }
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
    await this.applyThumbnailReadPolicy();
  }

  /**
   * Scene JSON never lives in MinIO (Postgres only) — thumbnails are the
   * only objects this app ever wants publicly readable, and only those
   * under the `thumbnails/` prefix. This is declarative (a full policy
   * document, not an incremental grant), so applying it on every
   * `onModuleInit` is safe and idempotent.
   */
  private async applyThumbnailReadPolicy(): Promise<void> {
    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: '*',
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${this.bucket}/thumbnails/*`],
        },
      ],
    };
    await this.client.send(
      new PutBucketPolicyCommand({
        Bucket: this.bucket,
        Policy: JSON.stringify(policy),
      }),
    );
  }

  /**
   * HeadBucketCommand throws a `NotFound` error (HTTP 404) when the bucket
   * doesn't exist. Verified empirically against a live MinIO instance with
   * the installed `@aws-sdk/client-s3` version: a missing bucket yields
   * `err.name === 'NotFound'` with `$metadata.httpStatusCode === 404`, while
   * other failures (e.g. bad credentials) surface as a generic
   * `S3ServiceException` with a different name/status (403 for auth
   * failures). Any error that isn't this specific "not found" signal is
   * rethrown so the real cause isn't masked by a misleading CreateBucket
   * failure.
   */
  private static isBucketNotFound(err: unknown): boolean {
    const name = (err as { name?: string } | undefined)?.name;
    const httpStatusCode = (err as { $metadata?: { httpStatusCode?: number } } | undefined)
      ?.$metadata?.httpStatusCode;
    return name === 'NotFound' || httpStatusCode === 404;
  }

  async getPresignedUploadUrl(key: string, contentType: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(this.client, command, { expiresIn: 900 });
  }
}
