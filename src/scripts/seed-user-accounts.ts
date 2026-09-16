import { backfillUserAccounts } from './user-accounts-seed'
import { exitWithError, getScriptContext } from './script-helpers'

async function main(): Promise<void> {
  getScriptContext()

  const results = await backfillUserAccounts()
  for (const result of results) {
    console.log(
      `Seeded account for ${result.username} (${result.userId}) with ${result.permissions.length} permissions.`,
    )
  }
}

void main().catch(exitWithError)
