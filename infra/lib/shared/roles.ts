export enum InfraRole {
  customer = 'customer',
  manager = 'manager',
  admin = 'admin',
}

export const infraRoles = [InfraRole.customer, InfraRole.manager, InfraRole.admin] as const
