import { MessageStatus } from '../leads/entities/message.entity'

const MESSAGE_STATUS_ORDER: Partial<Record<MessageStatus, number>> = {
  [MessageStatus.SENT]: 1,
  [MessageStatus.DELIVERED]: 2,
  [MessageStatus.READ]: 3
}

export function canTransitionMessageStatus(
  currentStatus: MessageStatus | null | undefined,
  nextStatus: MessageStatus
): boolean {
  if (!currentStatus) {
    return true
  }

  const currentOrder = MESSAGE_STATUS_ORDER[currentStatus]
  const nextOrder = MESSAGE_STATUS_ORDER[nextStatus]

  if (!currentOrder || !nextOrder) {
    return false
  }

  return nextOrder >= currentOrder
}