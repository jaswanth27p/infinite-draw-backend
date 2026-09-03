import { IsEnum, IsString, MinLength } from 'class-validator';
import { ShareRole } from '@prisma/client';

export class CreateShareDto {
  @IsString()
  @MinLength(1)
  userId!: string;

  @IsEnum(ShareRole)
  role!: ShareRole;
}
