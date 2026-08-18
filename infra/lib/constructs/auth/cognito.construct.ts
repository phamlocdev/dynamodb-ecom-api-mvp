import * as path from 'path'
import * as cdk from 'aws-cdk-lib'
import * as cognito from 'aws-cdk-lib/aws-cognito'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import { Construct } from 'constructs'
import { enableLocalStackCognitoTriggers } from '../../config/constants'
import { createNodejsBundling } from '../../shared/lambda-bundling'
import { InfraRole } from '../../shared/roles'
import { createUserPoolGroups } from './cognito-groups'

export interface CognitoConstructProps {
  callbackUrls: string[]
  logoutUrls: string[]
  hostedUiDomainPrefix: string
  googleClientId?: string
  googleClientSecret?: string
}

export class CognitoConstruct extends Construct {
  readonly userPool: cognito.UserPool
  readonly userPoolClient: cognito.UserPoolClient
  readonly userPoolDomain: cognito.UserPoolDomain

  constructor(scope: Construct, id: string, props: CognitoConstructProps) {
    super(scope, id)

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: true,
      signInAliases: { email: true, username: true },
      autoVerify: { email: true },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      passwordPolicy: {
        minLength: 8,
        requireDigits: true,
        requireLowercase: true,
        requireUppercase: true,
        requireSymbols: false,
      },
    })

    if (enableLocalStackCognitoTriggers) {
      const postConfirmationHandler = new nodejs.NodejsFunction(this, 'PostConfirmationHandler', {
        runtime: lambda.Runtime.NODEJS_24_X,
        entry: path.join(
          __dirname,
          '..',
          '..',
          '..',
          '..',
          'src',
          'cognito',
          'post-confirmation.ts',
        ),
        handler: 'handler',
        timeout: cdk.Duration.seconds(15),
        memorySize: 256,
        bundling: createNodejsBundling(),
        environment: {
          COGNITO_DEFAULT_GROUP: InfraRole.customer,
        },
      })

      this.userPool.addTrigger(cognito.UserPoolOperation.POST_CONFIRMATION, postConfirmationHandler)
    }

    const supportedIdentityProviders = [cognito.UserPoolClientIdentityProvider.COGNITO]
    const googleProvider =
      props.googleClientId && props.googleClientSecret
        ? new cognito.UserPoolIdentityProviderGoogle(this, 'GoogleProvider', {
            userPool: this.userPool,
            clientId: props.googleClientId,
            clientSecretValue: cdk.SecretValue.unsafePlainText(props.googleClientSecret),
            scopes: ['openid', 'email', 'profile'],
          })
        : undefined

    if (googleProvider) {
      supportedIdentityProviders.push(cognito.UserPoolClientIdentityProvider.GOOGLE)
    }

    this.userPoolClient = this.userPool.addClient('WebAppClient', {
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      preventUserExistenceErrors: true,
      accessTokenValidity: cdk.Duration.minutes(60),
      idTokenValidity: cdk.Duration.minutes(60),
      refreshTokenValidity: cdk.Duration.days(30),
      refreshTokenRotationGracePeriod: cdk.Duration.seconds(30),
      enableTokenRevocation: true,
      supportedIdentityProviders,
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: props.callbackUrls,
        logoutUrls: props.logoutUrls,
        defaultRedirectUri: props.callbackUrls[0],
      },
    })

    if (googleProvider) {
      this.userPoolClient.node.addDependency(googleProvider)
    }

    this.userPoolDomain = this.userPool.addDomain('HostedUiDomain', {
      cognitoDomain: {
        domainPrefix: props.hostedUiDomainPrefix,
      },
    })

    createUserPoolGroups(this, this.userPool)
  }
}
