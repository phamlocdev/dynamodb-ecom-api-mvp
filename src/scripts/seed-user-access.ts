import { seedAllUserAccess } from './user-access-seed'
import { exitWithError, getScriptContext } from './script-helpers'

async function main(): Promise<void> {
  getScriptContext()

  const results = await seedAllUserAccess()
  for (const result of results) {
    console.log(
      `Seeded access for ${result.username} (${result.userId}) with ${result.permissions.length} permissions.`,
    )
  }
}

void main().catch(exitWithError)
