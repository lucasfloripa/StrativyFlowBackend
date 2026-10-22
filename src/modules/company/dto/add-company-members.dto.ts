import { ArrayNotEmpty, ArrayUnique, IsArray, IsUUID } from 'class-validator'

export class AddCompanyMembersDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  userInformationsIds!: string[]
}
