import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class GenerateDiagramDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  prompt!: string;

  @IsUUID()
  requestId!: string;
}
