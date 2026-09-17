import type { PreSignUpTriggerEvent } from 'aws-lambda'
import { createCognitoTriggersApp } from '../worker.bootstrap'
import { PreSignUpService } from './pre-sign-up.service'

let servicePromise: Promise<PreSignUpService>

async function getPreSignUpService(): Promise<PreSignUpService> {
  if (!servicePromise) {
    servicePromise = createCognitoTriggersApp().then((app) => app.get(PreSignUpService))
  }

  return servicePromise
}

export async function handler(event: PreSignUpTriggerEvent): Promise<PreSignUpTriggerEvent> {
  const service = await getPreSignUpService()
  return service.handle(event)
}
