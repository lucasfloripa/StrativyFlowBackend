import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import axios from 'axios'
import { Repository } from 'typeorm'

import { UserInformations } from '../user/entities/user-informations.entity'

export type InstagramUserProfile = {
  id: string
  name?: string
  username?: string
  profile_pic?: string
}

export type InstagramSendMessageResponse = {
  recipient_id: string
  message_id: string
}

export type InstagramAttachmentType = 'image' | 'audio' | 'video' | 'file'

export type InstagramSendAttachmentResponse = InstagramSendMessageResponse

type InstagramGraphApiErrorResponse = {
  error?: {
    code?: number
    message?: string
    type?: string
  }
}

type AxiosLikeError<TResponse> = {
  response?: {
    data?: TResponse
    status?: number
  }
}

const INSTAGRAM_GRAPH_API_BASE_URL = 'https://graph.instagram.com/v23.0'
const INSTAGRAM_USER_PROFILE_FIELDS = 'name,username,profile_pic'

@Injectable()
export class InstagramMessagingService {
  private readonly logger = new Logger(InstagramMessagingService.name)

  constructor(
    @InjectRepository(UserInformations)
    private readonly userInformationsRepo: Repository<UserInformations>
  ) {}

  async getInstagramUserProfile(
    instagramAccountId: string,
    instagramUserId: string
  ): Promise<InstagramUserProfile> {
    const normalizedAccountId = instagramAccountId?.trim()
    const normalizedUserId = instagramUserId?.trim()

    if (!normalizedAccountId) {
      throw new BadRequestException('Instagram Account ID is not configured')
    }

    if (!normalizedUserId) {
      throw new BadRequestException('Instagram User ID is required')
    }

    const userInformations = await this.userInformationsRepo.findOne({
      where: { instagramAccountId: normalizedAccountId }
    })

    if (!userInformations) {
      throw new NotFoundException(
        'UserInformations not found for Instagram Account ID'
      )
    }

    if (!userInformations.instagramAccountId?.trim()) {
      throw new BadRequestException('Instagram Account ID is not configured')
    }

    const instagramToken = userInformations.instagramToken?.trim()

    if (!instagramToken) {
      throw new BadRequestException('Instagram token is not configured')
    }

    let responseData: unknown

    try {
      const response = await axios.get<InstagramUserProfile>(
        `${INSTAGRAM_GRAPH_API_BASE_URL}/${normalizedUserId}`,
        {
          params: {
            fields: INSTAGRAM_USER_PROFILE_FIELDS
          },
          headers: {
            Authorization: `Bearer ${instagramToken}`,
            'Content-Type': 'application/json'
          }
        }
      )

      responseData = response.data
    } catch (error: unknown) {
      this.handleGraphApiError(error, normalizedAccountId, normalizedUserId)
    }

    if (!this.isInstagramUserProfile(responseData)) {
      this.logger.error(
        `Invalid Instagram Graph API response. instagramAccountId=${normalizedAccountId}, instagramUserId=${normalizedUserId}`
      )
      throw new BadGatewayException(
        'Instagram Graph API returned an invalid user profile'
      )
    }

    return responseData
  }

  async sendMessage(
    instagramAccountId: string,
    instagramUserId: string,
    text: string
  ): Promise<InstagramSendMessageResponse> {
    const normalizedAccountId = instagramAccountId?.trim()
    const normalizedUserId = instagramUserId?.trim()
    const normalizedText = text?.trim()

    if (!normalizedAccountId) {
      throw new BadRequestException('Instagram Account ID is not configured')
    }

    if (!normalizedUserId) {
      throw new BadRequestException('Instagram User ID is required')
    }

    if (!normalizedText) {
      throw new BadRequestException('Instagram message text is required')
    }

    const userInformations = await this.userInformationsRepo.findOne({
      where: { instagramAccountId: normalizedAccountId }
    })

    if (!userInformations) {
      throw new NotFoundException(
        'UserInformations not found for Instagram Account ID'
      )
    }

    if (!userInformations.instagramAccountId?.trim()) {
      throw new BadRequestException('Instagram Account ID is not configured')
    }

    const instagramToken = userInformations.instagramToken?.trim()

    if (!instagramToken) {
      throw new BadRequestException('Instagram token is not configured')
    }

    let responseData: unknown

    try {
      const response = await axios.post<InstagramSendMessageResponse>(
        `${INSTAGRAM_GRAPH_API_BASE_URL}/${normalizedAccountId}/messages`,
        {
          recipient: {
            id: normalizedUserId
          },
          message: {
            text: normalizedText
          }
        },
        {
          headers: {
            Authorization: `Bearer ${instagramToken}`,
            'Content-Type': 'application/json'
          }
        }
      )

      responseData = response.data
    } catch (error: unknown) {
      this.handleGraphApiError(error, normalizedAccountId, normalizedUserId)
    }

    if (!this.isInstagramSendMessageResponse(responseData)) {
      this.logger.error(
        `Invalid Instagram Graph API send message response. instagramAccountId=${normalizedAccountId}, instagramUserId=${normalizedUserId}`
      )
      throw new BadGatewayException(
        'Instagram Graph API returned an invalid send message response'
      )
    }

    return responseData
  }

  async sendInstagramAttachment(
    instagramAccountId: string,
    instagramUserId: string,
    type: InstagramAttachmentType,
    url: string
  ): Promise<InstagramSendAttachmentResponse> {
    const normalizedAccountId = instagramAccountId?.trim()
    const normalizedUserId = instagramUserId?.trim()
    const normalizedUrl = url?.trim()

    if (!normalizedAccountId) {
      throw new BadRequestException('Instagram Account ID is not configured')
    }

    if (!normalizedUserId) {
      throw new BadRequestException('Instagram User ID is required')
    }

    if (!normalizedUrl) {
      throw new BadRequestException('Instagram attachment URL is required')
    }

    const userInformations = await this.userInformationsRepo.findOne({
      where: { instagramAccountId: normalizedAccountId }
    })

    if (!userInformations) {
      throw new NotFoundException(
        'UserInformations not found for Instagram Account ID'
      )
    }

    const instagramToken = userInformations.instagramToken?.trim()

    if (!instagramToken) {
      throw new BadRequestException('Instagram token is not configured')
    }

    let responseData: unknown

    try {
      const response = await axios.post<InstagramSendAttachmentResponse>(
        `${INSTAGRAM_GRAPH_API_BASE_URL}/${normalizedAccountId}/messages`,
        {
          recipient: {
            id: normalizedUserId
          },
          message: {
            attachment: {
              type,
              payload: {
                url: normalizedUrl
              }
            }
          }
        },
        {
          headers: {
            Authorization: `Bearer ${instagramToken}`,
            'Content-Type': 'application/json'
          }
        }
      )

      responseData = response.data
    } catch (error: unknown) {
      this.handleGraphApiError(
        error,
        normalizedAccountId,
        normalizedUserId,
        'attachment'
      )
    }

    if (!this.isInstagramSendMessageResponse(responseData)) {
      this.logger.error(
        `Invalid Instagram Graph API send attachment response. instagramAccountId=${normalizedAccountId}, instagramUserId=${normalizedUserId}`
      )
      throw new BadGatewayException(
        'Instagram Graph API returned an invalid send attachment response'
      )
    }

    return responseData
  }

  private handleGraphApiError(
    error: unknown,
    instagramAccountId: string,
    instagramUserId: string,
    operation: 'profile' | 'text' | 'attachment' = 'profile'
  ): never {
    if (!this.isAxiosLikeError<InstagramGraphApiErrorResponse>(error)) {
      this.logger.error(
        `Unexpected Instagram Graph API error. instagramAccountId=${instagramAccountId}, instagramUserId=${instagramUserId}`
      )
      throw new BadGatewayException(
        'Unexpected error while calling Instagram Graph API'
      )
    }

    const statusCode = error.response?.status
    const metaErrorCode = error.response?.data?.error?.code

    this.logger.error(
      `Instagram Graph API request failed. instagramAccountId=${instagramAccountId}, instagramUserId=${instagramUserId}, status=${statusCode ?? 'unknown'}, metaErrorCode=${metaErrorCode ?? 'unknown'}`
    )

    if (statusCode === 401 || statusCode === 403 || metaErrorCode === 190) {
      throw new UnauthorizedException('Instagram token is invalid or expired')
    }

    if (operation === 'attachment' && statusCode === 400) {
      throw new BadRequestException(
        'Instagram attachment URL or media format is invalid'
      )
    }

    if (statusCode === 400 || statusCode === 404 || metaErrorCode === 100) {
      throw new NotFoundException(
        'Instagram user not found or Instagram User ID is invalid'
      )
    }

    throw new BadGatewayException('Instagram Graph API request failed')
  }

  private isInstagramUserProfile(
    responseData: unknown
  ): responseData is InstagramUserProfile {
    if (typeof responseData !== 'object' || responseData === null) {
      return false
    }

    const profile = responseData as Record<string, unknown>

    return (
      typeof profile.id === 'string' &&
      Boolean(profile.id.trim()) &&
      this.isOptionalString(profile.name) &&
      this.isOptionalString(profile.username) &&
      this.isOptionalString(profile.profile_pic)
    )
  }

  private isOptionalString(value: unknown): value is string | undefined {
    return value === undefined || typeof value === 'string'
  }

  private isInstagramSendMessageResponse(
    responseData: unknown
  ): responseData is InstagramSendMessageResponse {
    if (typeof responseData !== 'object' || responseData === null) {
      return false
    }

    const response = responseData as Record<string, unknown>

    return (
      typeof response.recipient_id === 'string' &&
      Boolean(response.recipient_id.trim()) &&
      typeof response.message_id === 'string' &&
      Boolean(response.message_id.trim())
    )
  }

  private isAxiosLikeError<TResponse>(
    value: unknown
  ): value is AxiosLikeError<TResponse> {
    return typeof value === 'object' && value !== null && 'response' in value
  }
}
