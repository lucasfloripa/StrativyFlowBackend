import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator'

export class UpdateLeadFollowUpDto {
  @IsOptional()
  @IsString()
  value?: string

  @IsOptional()
  @IsDateString()
  dueAt?: string

  @IsOptional()
  @IsIn(['pending', 'done', 'canceled'])
  status?: 'pending' | 'done' | 'canceled'
}
