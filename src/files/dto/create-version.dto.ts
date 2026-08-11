import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateVersionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;
}
