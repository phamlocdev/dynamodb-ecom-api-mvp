import type { PostConfirmationTriggerEvent } from 'aws-lambda'
import { PostConfirmationService } from './post-confirmation.service'
import { createPostConfirmationApp } from '../worker.bootstrap'

let servicePromise: Promise<PostConfirmationService>

async function getPostConfirmationService(): Promise<PostConfirmationService> {
  if (!servicePromise) {
    servicePromise = createPostConfirmationApp().then((app) => app.get(PostConfirmationService))
  }

  return servicePromise
}

export async function handler(
  event: PostConfirmationTriggerEvent,
): Promise<PostConfirmationTriggerEvent> {
  const service = await getPostConfirmationService()
  return service.handle(event)
}
