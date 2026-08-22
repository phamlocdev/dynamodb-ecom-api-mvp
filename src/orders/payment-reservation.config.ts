export const PAYMENT_WINDOW_STRATEGY_SQS_MAX_SECONDS = 900
export const DEFAULT_PAYMENT_CONFIRMATION_SECONDS_TIMEOUT = 900
export const PAYMENT_WINDOW_EXPIRED_REASON = 'Payment window expired.'

export type PaymentReservationStrategy = 'delayed-sqs' | 'eventbridge-polling'

export function resolvePaymentConfirmationTimeoutSeconds(rawValue?: string): number {
  const parsed = Number(rawValue)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_PAYMENT_CONFIRMATION_SECONDS_TIMEOUT
  }

  return Math.floor(parsed)
}

export function resolvePaymentReservationStrategy(
  timeoutSeconds: number,
): PaymentReservationStrategy {
  return timeoutSeconds <= PAYMENT_WINDOW_STRATEGY_SQS_MAX_SECONDS
    ? 'delayed-sqs'
    : 'eventbridge-polling'
}
