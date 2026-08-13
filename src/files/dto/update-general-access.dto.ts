import { IsEnum, IsOptional } from 'class-validator';
import { GeneralAccess, ShareRole } from '@prisma/client';

export class UpdateGeneralAccessDto {
  @IsEnum(GeneralAccess)
  generalAccess!: GeneralAccess;

  @IsOptional()
  @IsEnum(ShareRole)
  generalAccessRole?: ShareRole;
}
