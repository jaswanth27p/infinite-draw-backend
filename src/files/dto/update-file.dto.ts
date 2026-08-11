import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateFileDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsObject()
  currentData?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  thumbnailUrl?: string;
}
