import serverlessExpress from '@codegenie/serverless-express'
import { Context, APIGatewayProxyEventV2 } from 'aws-lambda'
import { createNestApp } from './app.bootstrap'

type PromiseHandler = (event: APIGatewayProxyEventV2, context: Context) => Promise<unknown>

let cachedHandler: PromiseHandler

async function bootstrap(): Promise<PromiseHandler> {
  const app = await createNestApp()
  await app.init()

  const expressInstance = app.getHttpAdapter().getInstance()
  return serverlessExpress({ app: expressInstance }) as any
}

export const handler = async (event: APIGatewayProxyEventV2, context: Context): Promise<unknown> => {
  cachedHandler ??= await bootstrap()
  return cachedHandler(event, context)
}
