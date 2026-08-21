import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomUUID } from 'crypto'
import { MockPaymentResult } from './payments.types'

@Injectable()
export class PaymentsService {
  private readonly mockPaymentDelayMs: number
  private readonly mockPaymentFailureRate: number

  constructor(@Inject(ConfigService) configService: ConfigService) {
    this.mockPaymentDelayMs = Number(configService.get<string>('MOCK_PAYMENT_DELAY_MS') ?? 5000)
    this.mockPaymentFailureRate = Number(
      configService.get<string>('MOCK_PAYMENT_FAILURE_RATE') ?? 0,
    )
  }

  async processMockPayment(orderId: string): Promise<MockPaymentResult> {
    await wait(this.mockPaymentDelayMs)

    if (this.mockPaymentFailureRate > 0 && Math.random() < this.mockPaymentFailureRate) {
      return {
        success: false,
        failureReason: `Mock payment failed for order ${orderId}.`,
      }
    }

    return {
      success: true,
      transactionId: `mockpay_${randomUUID()}`,
    }
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
