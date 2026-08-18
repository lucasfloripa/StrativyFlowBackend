import axios from 'axios'

import { WhatsAppMessagingService } from './whatsapp-messaging.service'

jest.mock('axios')

describe('WhatsAppMessagingService', () => {
  it('sends one or more contacts through the Graph API v23', async () => {
    const response = {
      data: {
        messaging_product: 'whatsapp',
        contacts: [{ input: '5548984296447', wa_id: '554884296447' }],
        messages: [{ id: 'wamid.contact-1' }]
      }
    }
    jest.mocked(axios.post).mockResolvedValue(response)
    const service = new WhatsAppMessagingService()
    const contacts = [
      {
        name: {
          formatted_name: 'João da Silva',
          first_name: 'João',
          last_name: 'da Silva'
        },
        phones: [{ phone: '+5511999999999', type: 'CELL' as const }]
      }
    ]

    await expect(
      service.sendWhatsAppContact(
        '5548984296447',
        contacts,
        'phone-number-id',
        'whatsapp-token'
      )
    ).resolves.toBe(response)
    expect(axios.post).toHaveBeenCalledWith(
      'https://graph.facebook.com/v23.0/phone-number-id/messages',
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: '5548984296447',
        type: 'contacts',
        contacts
      },
      {
        headers: {
          Authorization: 'Bearer whatsapp-token',
          'Content-Type': 'application/json'
        }
      }
    )
  })
})
