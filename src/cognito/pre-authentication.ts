import type { PreAuthenticationTriggerEvent } from 'aws-lambda'
import { createCognitoTriggersApp } from '../worker.bootstrap'
import { PreAuthenticationService } from './pre-authentication.service'

let servicePromise: Promise<PreAuthenticationService>

async function getPreAuthenticationService(): Promise<PreAuthenticationService> {
  if (!servicePromise) {
    servicePromise = createCognitoTriggersApp().then((app) => app.get(PreAuthenticationService))
  }

  return servicePromise
}

export async function handler(
  event: PreAuthenticationTriggerEvent,
): Promise<PreAuthenticationTriggerEvent> {
  const service = await getPreAuthenticationService()
  return service.handle(event)
}
