import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'

import { AppModule } from './app.module'

const corsOriginEnv = process.env.CORS_ORIGIN
const appPort = Number(process.env.PORT)

if (!corsOriginEnv || Number.isNaN(appPort)) {
  throw new Error('CORS_ORIGIN and PORT env vars must be configured')
}

const corsOrigins = corsOriginEnv
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.useGlobalPipes(
    new ValidationPipe({
      exceptionFactory: (errors) => {
        const formattedErrors: Record<string, string> = {}

        errors.forEach((err) => {
          if (err.constraints) {
            const firstError = Object.values(err.constraints)[0]
            formattedErrors[err.property] = firstError
          }
        })

        return new BadRequestException({
          error: 'Validation Error',
          fields: formattedErrors
        })
      }
    })
  )
  app.enableCors({
    origin: [corsOrigins],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })

  await app.listen(appPort)
}
void bootstrap()
