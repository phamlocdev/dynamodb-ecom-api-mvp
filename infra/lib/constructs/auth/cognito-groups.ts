import * as cognito from 'aws-cdk-lib/aws-cognito'
import { Construct } from 'constructs'
import { infraRoles } from '../../shared/roles'

export function createUserPoolGroups(scope: Construct, userPool: cognito.UserPool): void {
  infraRoles.forEach((groupName, index) => {
    new cognito.CfnUserPoolGroup(scope, `${groupName}Group`, {
      groupName,
      precedence: index + 1,
      userPoolId: userPool.userPoolId,
    })
  })
}
