import type { EventBridgeEvent, SQSEvent, SQSBatchResponse } from 'aws-lambda'

export async function handleEventBridgeSqsBatch<TDetailType extends string, TDetail>(
  event: SQSEvent,
  workerName: string,
  handleEvent: (event: EventBridgeEvent<TDetailType, TDetail>) => Promise<void>,
): Promise<SQSBatchResponse> {
  const batchItemFailures: { itemIdentifier: string }[] = []

  for (const record of event.Records) {
    try {
      const eventBridgeEvent = JSON.parse(record.body) as EventBridgeEvent<TDetailType, TDetail>
      await handleEvent(eventBridgeEvent)
    } catch (error) {
      console.error(
        JSON.stringify({
          worker: workerName,
          message: 'Failed to process EventBridge event from SQS.',
          messageId: record.messageId,
          error: error instanceof Error ? error.message : String(error),
        }),
      )
      batchItemFailures.push({ itemIdentifier: record.messageId })
    }
  }

  return { batchItemFailures }
}
