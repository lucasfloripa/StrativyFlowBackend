import { createHmac } from 'crypto'

import { ExecutionContext, UnauthorizedException } from '@nestjs/common'

import {
  MetaWebhookSignatureGuard,
  parseMetaAppSecrets
} from './meta-webhook-signature.guard'

const sign = (secret: string, body: Buffer): string =>
  `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`

const buildContext = (request: {
  headers: Record<string, string | string[] | undefined>
  rawBody?: Buffer
  path?: string
}): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ path: '/webhook/whatsapp', ...request })
    })
  }) as unknown as ExecutionContext

describe('MetaWebhookSignatureGuard', () => {
  const body = Buffer.from('{"entry":[{"id":"page-1"}]}')

  describe('canActivate', () => {
    it('accepts a request signed with the app secret', () => {
      const guard = new MetaWebhookSignatureGuard(['app-secret'])

      expect(
        guard.canActivate(
          buildContext({
            headers: { 'x-hub-signature-256': sign('app-secret', body) },
            rawBody: body
          })
        )
      ).toBe(true)
    })

    it('accepts a request signed with any of the configured app secrets', () => {
      const guard = new MetaWebhookSignatureGuard([
        'whatsapp-app-secret',
        'instagram-app-secret'
      ])

      expect(
        guard.canActivate(
          buildContext({
            headers: {
              'x-hub-signature-256': sign('instagram-app-secret', body)
            },
            rawBody: body
          })
        )
      ).toBe(true)
    })

    it.each([
      ['the signature header is missing', undefined, body],
      ['the signature uses another secret', sign('other-secret', body), body],
      ['the header is not in the sha256= format', 'abc123', body],
      [
        'the body was changed after signing',
        sign('app-secret', body),
        Buffer.from('{"entry":[]}')
      ]
    ])(
      'rejects the request when %s',
      (_case, signature: string | undefined, rawBody: Buffer) => {
        const guard = new MetaWebhookSignatureGuard(['app-secret'])

        expect(() =>
          guard.canActivate(
            buildContext({
              headers: { 'x-hub-signature-256': signature },
              rawBody
            })
          )
        ).toThrow(UnauthorizedException)
      }
    )

    it('rejects the request when the raw body is not available', () => {
      const guard = new MetaWebhookSignatureGuard(['app-secret'])

      expect(() =>
        guard.canActivate(
          buildContext({
            headers: { 'x-hub-signature-256': sign('app-secret', body) }
          })
        )
      ).toThrow(UnauthorizedException)
    })
  })

  describe('parseMetaAppSecrets', () => {
    it('splits a comma separated list and trims each secret', () => {
      expect(parseMetaAppSecrets(' first , second ,')).toEqual([
        'first',
        'second'
      ])
    })

    it('throws when no secret is configured', () => {
      expect(() => parseMetaAppSecrets(' , ')).toThrow(
        'META_APP_SECRET must contain at least one app secret'
      )
    })
  })
})
