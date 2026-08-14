import {
  defaultHostedUiCallbackUrl,
  defaultHostedUiDomainPrefix,
  defaultLogoutUrl,
} from './constants'

export interface LocalStackInfraEnv {
  callbackUrls: string[]
  logoutUrls: string[]
  hostedUiDomainPrefix: string
}

export function getLocalStackInfraEnv(): LocalStackInfraEnv {
  return {
    callbackUrls: splitCsvEnv('CLIENT_COGNITO_CALLBACK_URLS', [defaultHostedUiCallbackUrl]),
    logoutUrls: splitCsvEnv('CLIENT_COGNITO_LOGOUT_URLS', [defaultLogoutUrl]),
    hostedUiDomainPrefix: process.env.COGNITO_DOMAIN_PREFIX ?? defaultHostedUiDomainPrefix,
  }
}

function splitCsvEnv(name: string, fallback: string[]): string[] {
  const value = process.env[name]
  if (!value) {
    return fallback
  }

  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  return items.length > 0 ? items : fallback
}
