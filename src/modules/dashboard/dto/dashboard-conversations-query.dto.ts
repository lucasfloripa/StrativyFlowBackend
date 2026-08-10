import { IsEnum, IsOptional } from 'class-validator'

export enum DashboardConversationFilter {
  ALL = 'all',
  NEW = 'new',
  LAST_72H = 'last72h',
  TODAY = 'today',
  NO_RESPONSE_24H = 'noResponse24h'
}

export class DashboardConversationsQueryDto {
  @IsOptional()
  @IsEnum(DashboardConversationFilter)
  filter: DashboardConversationFilter = DashboardConversationFilter.ALL
}
