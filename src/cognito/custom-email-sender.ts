import type { CustomEmailSenderTriggerEvent } from 'aws-lambda'
import { createCognitoTriggersApp } from '../worker.bootstrap'
import { CustomEmailSenderService } from './custom-email-sender.service'

let servicePromise: Promise<CustomEmailSenderService>

async function getCustomEmailSenderService(): Promise<CustomEmailSenderService> {
  if (!servicePromise) {
    servicePromise = createCognitoTriggersApp().then((app) => app.get(CustomEmailSenderService))
  }

  return servicePromise
}

export async function handler(
  event: CustomEmailSenderTriggerEvent,
): Promise<CustomEmailSenderTriggerEvent> {
  const service = await getCustomEmailSenderService()
  return service.handle(event)
}
