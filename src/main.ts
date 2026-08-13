import { createNestApp } from './app.bootstrap'

async function bootstrap(): Promise<void> {
  const app = await createNestApp({ enableSwagger: true })
  const port = Number(process.env.PORT ?? 8000)
  await app.listen(port)
}

void bootstrap()
