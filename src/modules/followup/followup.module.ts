import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { Negotiation } from '../negotiation/entities/negotiation.entity'
import { UserInformations } from '../user/entities/user-informations.entity'

import { FollowUpStepController } from './controllers/followup-step.controller'
import { FollowUpController } from './controllers/followup.controller'
import { MessageTemplateController } from './controllers/message-template.controller'
import { FollowUpStep } from './entities/followup-step.entity'
import { FollowUp } from './entities/followup.entity'
import { Template } from './entities/template.entity'
import { FollowUpExecutionModule } from './followup-execution.module'
import { FollowUpStepService } from './services/followup-step.service'
import { FollowUpService } from './services/followup.service'
import { MessageTemplateService } from './services/message-template.service'

@Module({
  imports: [
    FollowUpExecutionModule,
    TypeOrmModule.forFeature([
      FollowUp,
      FollowUpStep,
      Negotiation,
      Template,
      UserInformations
    ])
  ],
  controllers: [
    FollowUpController,
    FollowUpStepController,
    MessageTemplateController
  ],
  providers: [FollowUpService, MessageTemplateService, FollowUpStepService],
  exports: [FollowUpService, MessageTemplateService, FollowUpExecutionModule]
})
export class FollowUpModule {}
