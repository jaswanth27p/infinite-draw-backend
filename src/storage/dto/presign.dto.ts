import { IsNotEmpty, IsString } from 'class-validator';

export class PresignDto {
  @IsString()
  @IsNotEmpty()
  key!: string;

  @IsString()
  @IsNotEmpty()
  contentType!: string;
}
