export type FollowUpAutomationEmailInput = {
  recipientName?: string | null
  message: string
}

const colors = {
  primary: '#1D4D33',
  text: '#25332B',
  muted: '#66736B',
  border: '#B7D9C2',
  background: '#D8EBDD',
  surface: '#EEF7F0'
}

export function buildFollowUpAutomationEmail(
  input: FollowUpAutomationEmailInput
): string {
  const recipientName = input.recipientName?.trim()
  const greeting = recipientName ? `Olá, ${recipientName}` : 'Olá'
  const message = escapeHtml(input.message).replaceAll('\n', '<br>')

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Mensagem do StrativyFlow</title>
  </head>
  <body style="margin:0;padding:0;background:${colors.background};font-family:Arial,Helvetica,sans-serif;color:${colors.text};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Você recebeu uma nova mensagem pelo StrativyFlow.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:${colors.background};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;border-collapse:separate;background:${colors.surface};border:1px solid ${colors.border};border-radius:8px;overflow:hidden;">
            <tr>
              <td style="height:6px;background:${colors.primary};font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:26px 32px 20px;border-bottom:1px solid ${colors.border};">
                <div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;font-style:italic;font-weight:700;color:${colors.primary};">StrativyFlow</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:36px;font-weight:700;color:${colors.text};">${escapeHtml(greeting)}</h1>
                <div style="font-size:16px;line-height:26px;color:${colors.text};">${message}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background:#E8F4EC;border-top:1px solid ${colors.border};">
                <p style="margin:0;font-size:12px;line-height:19px;color:${colors.muted};">Esta mensagem foi enviada por meio do StrativyFlow.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
