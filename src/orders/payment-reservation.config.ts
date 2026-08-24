export const DEFAULT_PAYMENT_CONFIRMATION_SECONDS_TIMEOUT = 60
export const PAYMENT_WINDOW_EXPIRED_REASON = 'Payment window expired.'

export function resolvePaymentConfirmationTimeoutSeconds(rawValue?: string): number {
  const parsed = Number(rawValue)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_PAYMENT_CONFIRMATION_SECONDS_TIMEOUT
  }

  return Math.floor(parsed)
}
