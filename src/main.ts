import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'

import { AppModule } from './app.module'
import { parseTrustProxyHops } from './modules/rate-limit/trust-proxy'

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
  // rawBody keeps the request bytes for Meta webhook signature checks.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true
  })
  // SIGTERM/SIGINT run the Nest shutdown hooks (close Rabbit, Postgres, HTTP).
  app.enableShutdownHooks()

  // Behind Nginx/a load balancer, the client IP (used by rate limiting) comes
  // from X-Forwarded-For. Set TRUST_PROXY to the number of proxies in front.
  const trustProxyHops = parseTrustProxyHops(process.env.TRUST_PROXY)
  if (trustProxyHops) {
    app.set('trust proxy', trustProxyHops)
  }

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
