import { Inject, Injectable, Logger } from '@nestjs/common'
import { buildClient, CommitmentPolicy, KmsKeyringNode } from '@aws-crypto/client-node'
import type { CustomEmailSenderTriggerEvent } from 'aws-lambda'
import { SesMailService } from '../mail/ses-mail.service'
import type { CognitoAuthEmailType } from '../mail/mail.types'

const { decrypt } = buildClient(CommitmentPolicy.REQUIRE_ENCRYPT_ALLOW_DECRYPT)

@Injectable()
export class CustomEmailSenderService {
  private readonly logger = new Logger(CustomEmailSenderService.name)

  constructor(
    @Inject(SesMailService)
    private readonly sesMailService: SesMailService,
  ) {}

  async handle(event: CustomEmailSenderTriggerEvent): Promise<CustomEmailSenderTriggerEvent> {
    const emailType = toEmailType(event.triggerSource)
    const email = readEmail(event)
    const username = readUsername(event)
    const sub = readSub(event)

    this.logger.log(
      JSON.stringify({
        action: 'custom-email-sender-start',
        triggerSource: event.triggerSource,
        userPoolId: event.userPoolId,
        userName: event.userName,
        userId: sub,
        emailType,
        recipient: email,
      }),
    )

    if (!emailType) {
      this.logger.warn(
        JSON.stringify({
          action: 'custom-email-sender-skipped',
          reason: 'unsupported-trigger-source',
          triggerSource: event.triggerSource,
          userPoolId: event.userPoolId,
          userName: event.userName,
          userId: sub,
        }),
      )
      return event
    }

    const code = event.request.code ? await decryptCode(event.request.code) : undefined
    const result = await this.sesMailService.sendCognitoAuthEmail({
      emailType,
      user: {
        sub,
        username,
        email,
        name: readName(event),
      },
      code,
    })

    this.logger.log(
      JSON.stringify({
        action: 'custom-email-sender-finished',
        triggerSource: event.triggerSource,
        userPoolId: event.userPoolId,
        userName: event.userName,
        userId: sub,
        emailType,
        recipient: email,
        status: result.status,
        reason: result.reason,
        messageId: result.messageId,
      }),
    )

    return event
  }
}

async function decryptCode(encryptedCode: string): Promise<string> {
  const keyId = process.env.KEY_ID
  const keyArn = process.env.KEY_ARN
  if (!keyId || !keyArn) {
    throw new Error('Custom email sender KMS configuration is missing.')
  }

  const keyring = new KmsKeyringNode({
    generatorKeyId: keyId,
    keyIds: [keyArn],
  })
  const { plaintext } = await decrypt(keyring, Buffer.from(encryptedCode, 'base64'))
  return Buffer.from(plaintext).toString('utf8')
}

function toEmailType(triggerSource: string): CognitoAuthEmailType | undefined {
  switch (triggerSource) {
    case 'CustomEmailSender_SignUp':
      return 'COGNITO_SIGN_UP'
    case 'CustomEmailSender_ResendCode':
      return 'COGNITO_RESEND_CODE'
    case 'CustomEmailSender_ForgotPassword':
      return 'COGNITO_FORGOT_PASSWORD'
    case 'CustomEmailSender_AdminCreateUser':
      return 'COGNITO_ADMIN_CREATE_USER'
    case 'CustomEmailSender_UpdateUserAttribute':
      return 'COGNITO_UPDATE_USER_ATTRIBUTE'
    case 'CustomEmailSender_VerifyUserAttribute':
      return 'COGNITO_VERIFY_USER_ATTRIBUTE'
    case 'CustomEmailSender_Authentication':
      return 'COGNITO_AUTHENTICATION'
    case 'CustomEmailSender_AccountTakeOverNotification':
      return 'COGNITO_ACCOUNT_TAKEOVER_NOTIFICATION'
    default:
      return undefined
  }
}

function readEmail(event: CustomEmailSenderTriggerEvent): string | undefined {
  const attributes = event.request.userAttributes as Record<string, string | undefined>
  return attributes.email ?? attributes.EMAIL
}

function readUsername(event: CustomEmailSenderTriggerEvent): string {
  const attributes = event.request.userAttributes as Record<string, string | undefined>
  return attributes.username ?? attributes.USER_NAME ?? event.userName
}

function readSub(event: CustomEmailSenderTriggerEvent): string | undefined {
  const attributes = event.request.userAttributes as Record<string, string | undefined>
  return attributes.sub
}

function readName(event: CustomEmailSenderTriggerEvent): string | undefined {
  const attributes = event.request.userAttributes as Record<string, string | undefined>
  return attributes.name
}
