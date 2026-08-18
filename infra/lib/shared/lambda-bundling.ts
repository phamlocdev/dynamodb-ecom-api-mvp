import * as path from 'path'
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'

const sharedExternalModules = [
  '@nestjs/microservices',
  '@nestjs/microservices/microservices-module',
  '@nestjs/websockets/socket-module',
  'class-transformer/storage',
]

export function createNodejsBundling(
  options: {
    afterBundling?: nodejs.ICommandHooks['afterBundling']
  } = {},
): nodejs.BundlingOptions {
  return {
    preCompilation: true,
    bundleAwsSDK: true,
    externalModules: sharedExternalModules,
    keepNames: true,
    minify: false,
    sourceMap: true,
    target: 'node24',
    tsconfig: path.join(__dirname, '..', '..', '..', 'tsconfig.json'),
    commandHooks: {
      beforeBundling: () => [],
      beforeInstall: () => [],
      afterBundling: options.afterBundling ?? (() => []),
    },
  }
}

export function removeGeneratedSourceArtifacts(): string[] {
  return [
    process.platform === 'win32'
      ? 'powershell -NoProfile -Command "Get-ChildItem -Path src -Recurse -Include *.js,*.js.map,*.d.ts | Remove-Item -Force"'
      : 'find src \\( -name "*.js" -o -name "*.js.map" -o -name "*.d.ts" \\) -delete',
  ]
}
