import {
  AdminAddUserToGroupCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider'
import type { PostConfirmationTriggerHandler } from 'aws-lambda'

const defaultGroup = process.env.COGNITO_DEFAULT_GROUP ?? 'customer'
const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'ap-southeast-1'

const cognitoClient = new CognitoIdentityProviderClient({ region })

export const handler: PostConfirmationTriggerHandler = async (event) => {
  if (!event.userPoolId || !event.userName) {
    return event
  }

  await cognitoClient.send(
    new AdminAddUserToGroupCommand({
      GroupName: defaultGroup,
      UserPoolId: event.userPoolId,
      Username: event.userName,
    }),
  )

  return event
}
