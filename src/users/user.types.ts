export type ManagedUser = {
  username: string
  enabled: boolean
  status?: string
  name?: string
  sub?: string
  email?: string
  emailVerified: boolean
  groups: string[]
  createdAt?: string
  updatedAt?: string
}

export interface CustomerProfile {
  username: string
  email?: string
  name?: string
  sub?: string
}
