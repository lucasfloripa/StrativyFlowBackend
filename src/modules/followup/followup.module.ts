import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { UserInformations } from '../user/entities/user-informations.entity'

import { FollowUpController } from './controllers/followup.controller'
import { MessageTemplateController } from './controllers/message-template.controller'
import { FollowUp } from './entities/followup.entity'
import { Template } from './entities/template.entity'
import { FollowUpCron } from './services/followup-cron.service'
import { FollowUpExecutor } from './services/followup-executor.service'
import { FollowUpTemplateCommandMapper } from './services/followup-template-command.mapper'
import { FollowUpService } from './services/followup.service'
import { MessageTemplateService } from './services/message-template.service'
import { MetaWhatsAppClient } from './services/meta-whatsapp-client.service'
import { WhatsAppTemplateSender } from './services/whatsapp-template-sender.service'

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([FollowUp, Template, UserInformations])
  ],
  controllers: [FollowUpController, MessageTemplateController],
  providers: [
    FollowUpService,
    MessageTemplateService,
    FollowUpExecutor,
    FollowUpCron,
    FollowUpTemplateCommandMapper,
    MetaWhatsAppClient,
    WhatsAppTemplateSender
  ],
  exports: [
    FollowUpService,
    MessageTemplateService,
    FollowUpExecutor,
    MetaWhatsAppClient,
    WhatsAppTemplateSender
  ]
})
export class FollowUpModule {}
