import type { PreTokenGenerationV2TriggerEvent } from 'aws-lambda'
import { createCognitoTriggersApp } from '../worker.bootstrap'
import { PreTokenGenerationService } from './pre-token-generation.service'

let servicePromise: Promise<PreTokenGenerationService>

async function getPreTokenGenerationService(): Promise<PreTokenGenerationService> {
  if (!servicePromise) {
    servicePromise = createCognitoTriggersApp().then((app) => app.get(PreTokenGenerationService))
  }

  return servicePromise
}

export async function handler(
  event: PreTokenGenerationV2TriggerEvent,
): Promise<PreTokenGenerationV2TriggerEvent> {
  const service = await getPreTokenGenerationService()
  return service.handle(event)
}
