export type ManagedUser = {
  username: string
  enabled: boolean
  status?: string
  email?: string
  emailVerified: boolean
  groups: string[]
  createdAt?: string
  updatedAt?: string
}
