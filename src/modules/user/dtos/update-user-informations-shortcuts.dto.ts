import { IsObject, IsOptional } from 'class-validator'

export class UpdateUserInformationsShortcutsDto {
  @IsOptional()
  @IsObject()
  messageShortcuts?: Record<string, string> | null
}
