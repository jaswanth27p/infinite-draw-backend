import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  notifyFileShared?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyRoleChanged?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyAccessRemoved?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyMentioned?: boolean;
}
