import { IsIn, IsNotEmpty, IsString, ValidateIf } from 'class-validator';

export const ALLOWED_IMAGE_CONTENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
] as const;

export class PresignDto {
  @IsString()
  @IsNotEmpty()
  fileId!: string;

  @ValidateIf((o) => o.kind !== undefined)
  @IsIn(['thumbnail', 'image'])
  kind?: 'thumbnail' | 'image';

  // Only required (and only validated against the allowlist) when
  // kind === 'image' — the existing thumbnail call site never sends this
  // field and must keep working unchanged.
  @ValidateIf((o) => o.kind === 'image')
  @IsIn(ALLOWED_IMAGE_CONTENT_TYPES)
  contentType?: string;
}
