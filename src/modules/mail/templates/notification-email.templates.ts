type EmailLayoutInput = {
  preview: string
  eyebrow: string
  title: string
  introduction: string
  accentColor: string
  content: string
}

export type DailyFollowUpEmailItem = {
  leadName: string
  followUpValue: string
  dueAt: Date
}

const brand = {
  primary: '#1D4D33',
  primaryLight: '#E8F4EC',
  text: '#25332B',
  muted: '#66736B',
  border: '#DDE7E0',
  background: '#D8EBDD',
  surface: '#EEF7F0'
}

export function buildNewLeadEmail(input: {
  leadName: string
  firstContactAt?: Date
}): string {
  return renderEmail({
    preview: `Um novo lead entrou no Flow: ${input.leadName}`,
    eyebrow: 'Novo lead',
    title: 'Uma nova oportunidade chegou',
    introduction:
      'Um novo contato entrou no seu fluxo comercial. Confira os dados e faça o primeiro contato no melhor momento.',
    accentColor: brand.primary,
    content: renderDetails([
      { label: 'Lead', value: input.leadName },
      {
        label: 'Primeiro contato',
        value: input.firstContactAt
          ? formatBrazilianDateTime(input.firstContactAt)
          : 'Horário não informado'
      }
    ])
  })
}

export function buildFollowUpOneHourEmail(input: {
  followUpTitle: string
  leadName: string
  channelLabel: string
}): string {
  return renderEmail({
    preview: `Follow-up com ${input.leadName} em menos de uma hora`,
    eyebrow: 'Próximo compromisso',
    title: 'Seu follow-up vence em 1 hora',
    introduction:
      'Este é um lembrete para você se preparar e manter a negociação em movimento.',
    accentColor: brand.primary,
    content: renderDetails([
      { label: 'Follow-up', value: input.followUpTitle },
      { label: 'Lead', value: input.leadName },
      { label: 'Canal', value: input.channelLabel }
    ])
  })
}

export function buildConversationExpiringEmail(leadName: string): string {
  return renderEmail({
    preview: `A janela de atendimento de ${leadName} expira em menos de uma hora`,
    eyebrow: 'Atenção ao prazo',
    title: 'A conversa expira em 1 hora',
    introduction:
      'Responda agora para manter a janela de atendimento ativa e continuar a conversa normalmente.',
    accentColor: brand.primary,
    content: renderDetails([{ label: 'Lead', value: leadName }])
  })
}

export function buildConversationExpiredEmail(leadName: string): string {
  return renderEmail({
    preview: `A conversa com ${leadName} saiu da janela de atendimento`,
    eyebrow: 'Janela encerrada',
    title: 'A conversa expirou',
    introduction:
      'A janela de atendimento de 24 horas foi encerrada. Para retomar o contato, será necessário enviar um template aprovado.',
    accentColor: brand.primary,
    content: renderDetails([{ label: 'Lead', value: leadName }])
  })
}

export function buildDailyFollowUpSummaryEmail(
  items: DailyFollowUpEmailItem[]
): string {
  const rows = items
    .map((item) => {
      const dueAtLabel = item.dueAt.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit'
      })

      return `
        <tr>
          <td style="padding:16px 0;border-bottom:1px solid ${brand.border};vertical-align:top;">
            <div style="font-size:15px;font-weight:700;line-height:22px;color:${brand.text};">${escapeHtml(item.leadName)}</div>
            <div style="margin-top:3px;font-size:14px;line-height:21px;color:${brand.muted};">${escapeHtml(item.followUpValue)}</div>
          </td>
          <td style="padding:16px 0 16px 16px;border-bottom:1px solid ${brand.border};vertical-align:top;text-align:right;white-space:nowrap;">
            <span style="display:inline-block;padding:5px 9px;border-radius:6px;background:${brand.primaryLight};font-size:13px;font-weight:700;color:${brand.primary};">${escapeHtml(dueAtLabel)}</span>
          </td>
        </tr>`
    })
    .join('')

  const itemLabel = items.length === 1 ? 'follow-up' : 'follow-ups'

  return renderEmail({
    preview: `Você tem ${items.length} ${itemLabel} para hoje`,
    eyebrow: 'Agenda do dia',
    title: `Seus follow-ups de hoje`,
    introduction: `Você tem ${items.length} ${itemLabel} pendente${items.length === 1 ? '' : 's'}. Organize seu dia e mantenha cada oportunidade avançando.`,
    accentColor: brand.primary,
    content: `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        ${rows}
      </table>`
  })
}

function renderEmail(input: EmailLayoutInput): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(input.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:${brand.background};font-family:Arial,Helvetica,sans-serif;color:${brand.text};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(input.preview)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:${brand.background};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;border-collapse:separate;background:${brand.surface};border:1px solid ${brand.border};border-radius:8px;overflow:hidden;">
            <tr>
              <td style="height:6px;background:${input.accentColor};font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:26px 32px 20px;border-bottom:1px solid ${brand.border};">
                <div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;font-style:italic;font-weight:700;color:${brand.primary};">StrativyFlow</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <div style="margin-bottom:10px;font-size:12px;font-weight:700;letter-spacing:0;text-transform:uppercase;color:${input.accentColor};">${escapeHtml(input.eyebrow)}</div>
                <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:38px;font-weight:700;color:${brand.text};">${escapeHtml(input.title)}</h1>
                <p style="margin:14px 0 24px;font-size:16px;line-height:25px;color:${brand.muted};">${escapeHtml(input.introduction)}</p>
                ${input.content}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background:#F8FAF8;border-top:1px solid ${brand.border};">
                <p style="margin:0;font-size:12px;line-height:19px;color:#7A867E;">Esta é uma notificação automática do StrativyFlow. As preferências de envio podem ser alteradas nas configurações de notificações.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function renderDetails(items: Array<{ label: string; value: string }>): string {
  const details = items
    .map(
      (item) => `
        <tr>
          <td style="padding:7px 0;width:110px;vertical-align:top;font-size:13px;font-weight:700;line-height:20px;color:${brand.muted};">${escapeHtml(item.label)}</td>
          <td style="padding:7px 0 7px 16px;vertical-align:top;font-size:15px;line-height:22px;color:${brand.text};">${escapeHtml(item.value)}</td>
        </tr>`
    )
    .join('')

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;padding:13px 18px;background:#F8FAF8;border:1px solid ${brand.border};border-radius:7px;">
      ${details}
    </table>`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatBrazilianDateTime(value: Date): string {
  if (Number.isNaN(value.getTime())) {
    return 'Horário não informado'
  }

  return value.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
