import { defaultSeedUsers, ensureSeedUser } from './user-seed'
import { exitWithError, getScriptContext } from './script-helpers'

async function main(): Promise<void> {
  getScriptContext()

  for (const account of defaultSeedUsers) {
    const user = await ensureSeedUser(account)
    console.log(`Seeded user ${user.username} (${user.sub}) in group ${account.group}.`)
  }
}

void main().catch(exitWithError)
