import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

export class CreateBoardDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  boardPhone: string
}
