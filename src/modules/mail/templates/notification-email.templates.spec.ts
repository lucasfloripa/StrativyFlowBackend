import {
  buildConversationExpiredEmail,
  buildConversationExpiringEmail,
  buildDailyFollowUpSummaryEmail,
  buildFollowUpOneHourEmail,
  buildNewLeadEmail
} from './notification-email.templates'

describe('notification email templates', () => {
  it('builds a branded new lead email and escapes dynamic content', () => {
    const html = buildNewLeadEmail({
      leadName: '<Lead Teste>',
      firstContactAt: new Date('2026-08-25T14:30:00.000Z')
    })

    expect(html).toContain('<!doctype html>')
    expect(html).toContain('StrativyFlow')
    expect(html).toContain('&lt;Lead Teste&gt;')
    expect(html).toContain('background:#D8EBDD')
    expect(html).toContain('background:#EEF7F0')
    expect(html).not.toContain('Detalhes')
    expect(html).toContain('Primeiro contato')
    expect(html).toContain('25/08/2026, 11:30')
    expect(html).not.toContain('<Lead Teste>')
  })

  it('builds the one-hour follow-up email with its context', () => {
    const html = buildFollowUpOneHourEmail({
      followUpTitle: 'Enviar proposta',
      leadName: 'Empresa Teste',
      channelLabel: 'Email'
    })

    expect(html).toContain('Seu follow-up vence em 1 hora')
    expect(html).toContain('Enviar proposta')
    expect(html).toContain('Empresa Teste')
    expect(html).toContain('Email')
    expect(html).toContain('background:#D8EBDD')
    expect(html).toContain('background:#EEF7F0')
  })

  it('builds different conversation warning and expiration messages', () => {
    const expiringHtml = buildConversationExpiringEmail('Lead Teste')
    const expiredHtml = buildConversationExpiredEmail('Lead Teste')

    expect(expiringHtml).toContain('A conversa expira em 1 hora')
    expect(expiringHtml).toContain('Responda agora')
    expect(expiredHtml).toContain('A conversa expirou')
    expect(expiredHtml).toContain('template aprovado')
  })

  it('builds the daily summary with every follow-up and its time', () => {
    const html = buildDailyFollowUpSummaryEmail([
      {
        leadName: 'Lead A',
        followUpValue: 'Ligação',
        dueAt: new Date(2026, 7, 25, 9, 30)
      },
      {
        leadName: 'Lead B',
        followUpValue: 'Enviar proposta',
        dueAt: new Date(2026, 7, 25, 14, 0)
      }
    ])

    expect(html).toContain('Você tem 2 follow-ups pendentes')
    expect(html).toContain('Lead A')
    expect(html).toContain('09:30')
    expect(html).toContain('Lead B')
    expect(html).toContain('14:00')
  })
})
