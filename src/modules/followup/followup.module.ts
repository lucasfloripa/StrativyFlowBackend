import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { TypeOrmModule } from '@nestjs/typeorm'

import { FollowUpController } from './controllers/followup.controller'
import { MessageTemplateController } from './controllers/message-template.controller'
import { FollowUp } from './entities/followup.entity'
import { Template } from './entities/template.entity'
import { FollowUpExecutor } from './services/followup-executor.service'
import { FollowUpCron } from './services/followup-cron.service'
import { FollowUpTemplateCommandMapper } from './services/followup-template-command.mapper'
import { FollowUpService } from './services/followup.service'
import { MetaWhatsAppClient } from './services/meta-whatsapp-client.service'
import { MessageTemplateService } from './services/message-template.service'
import { WhatsAppTemplateSender } from './services/whatsapp-template-sender.service'
import { UserInformations } from '../user/entities/user-informations.entity'

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
