import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PresignDto } from './presign.dto';

describe('PresignDto', () => {
  it('accepts kind: thumbnail with no contentType', async () => {
    const dto = plainToInstance(PresignDto, { fileId: 'f1', kind: 'thumbnail' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts no kind at all (defaults handled by the controller, not the DTO)', async () => {
    const dto = plainToInstance(PresignDto, { fileId: 'f1' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts kind: image with an allowed contentType', async () => {
    const dto = plainToInstance(PresignDto, { fileId: 'f1', kind: 'image', contentType: 'image/webp' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects kind: image with a disallowed contentType', async () => {
    const dto = plainToInstance(PresignDto, { fileId: 'f1', kind: 'image', contentType: 'application/pdf' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('contentType');
  });

  it('rejects kind: image with no contentType at all', async () => {
    const dto = plainToInstance(PresignDto, { fileId: 'f1', kind: 'image' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('contentType');
  });

  it('rejects an invalid kind value', async () => {
    const dto = plainToInstance(PresignDto, { fileId: 'f1', kind: 'video' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('kind');
  });
});
