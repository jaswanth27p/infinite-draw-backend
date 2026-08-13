import { IsEmail, IsEnum } from 'class-validator';
import { ShareRole } from '@prisma/client';

export class CreateShareDto {
  @IsEmail()
  email!: string;

  @IsEnum(ShareRole)
  role!: ShareRole;
}
