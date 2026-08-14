import serverlessExpress from '@codegenie/serverless-express'
import { Context, Handler, ProxyCallback, APIGatewayProxyEvent } from 'aws-lambda'
import { createNestApp } from './app.bootstrap'

let cachedHandler: Handler

async function bootstrap(): Promise<Handler> {
  const app = await createNestApp()
  await app.init()

  const expressInstance = app.getHttpAdapter().getInstance()
  return serverlessExpress({ app: expressInstance })
}

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context,
  callback: ProxyCallback,
): Promise<unknown> => {
  cachedHandler ??= await bootstrap()
  return cachedHandler(event, context, callback)
}
