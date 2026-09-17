import type { PostAuthenticationTriggerEvent } from 'aws-lambda'
import { createCognitoTriggersApp } from '../worker.bootstrap'
import { PostAuthenticationService } from './post-authentication.service'

let servicePromise: Promise<PostAuthenticationService>

async function getPostAuthenticationService(): Promise<PostAuthenticationService> {
  if (!servicePromise) {
    servicePromise = createCognitoTriggersApp().then((app) => app.get(PostAuthenticationService))
  }

  return servicePromise
}

export async function handler(
  event: PostAuthenticationTriggerEvent,
): Promise<PostAuthenticationTriggerEvent> {
  const service = await getPostAuthenticationService()
  return service.handle(event)
}
