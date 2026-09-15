import { SetMetadata } from '@nestjs/common'
import { Permission } from './permissions'

export const PERMISSIONS_KEY = 'requiredPermissions'

export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions)
