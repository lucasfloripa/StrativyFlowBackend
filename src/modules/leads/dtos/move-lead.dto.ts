import { IsInt, IsNotEmpty, IsUUID, Min } from 'class-validator'

export class MoveLeadDto {
  @IsUUID()
  @IsNotEmpty()
  boardId: string

  @IsUUID()
  @IsNotEmpty()
  toColumnId: string

  @IsInt()
  @Min(0)
  toPosition: number
}
