import { IsEnum } from 'class-validator';
import { ShareRole } from '@prisma/client';

export class UpdateShareDto {
  @IsEnum(ShareRole)
  role!: ShareRole;
}
