import { buildFollowUpAutomationEmail } from './followup-automation-email.template'

describe('buildFollowUpAutomationEmail', () => {
  it('builds a branded email with the recipient and message', () => {
    const html = buildFollowUpAutomationEmail({
      recipientName: 'Maria',
      message: 'Olá!\nPodemos conversar?'
    })

    expect(html).toContain('<!doctype html>')
    expect(html).toContain('StrativyFlow')
    expect(html).toContain('Olá, Maria')
    expect(html).toContain('Olá!<br>Podemos conversar?')
    expect(html).toContain('background:#D8EBDD')
    expect(html).toContain('background:#EEF7F0')
  })

  it('escapes unsafe recipient and message content', () => {
    const html = buildFollowUpAutomationEmail({
      recipientName: '<Maria>',
      message: '<script>alert("test")</script>'
    })

    expect(html).toContain('Olá, &lt;Maria&gt;')
    expect(html).toContain(
      '&lt;script&gt;alert(&quot;test&quot;)&lt;/script&gt;'
    )
    expect(html).not.toContain('<script>')
  })
})
