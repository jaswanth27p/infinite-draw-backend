import { IsNotEmpty, IsString } from 'class-validator';

export class PresignDto {
  @IsString()
  @IsNotEmpty()
  fileId!: string;
}
