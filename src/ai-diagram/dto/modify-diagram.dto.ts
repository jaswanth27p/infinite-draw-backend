import { IsArray, IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class ModifyDiagramDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  prompt!: string;

  @IsUUID()
  requestId!: string;

  @IsArray()
  selectedElements!: unknown[];
}
