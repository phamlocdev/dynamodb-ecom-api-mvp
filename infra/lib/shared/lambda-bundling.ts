import * as path from 'path'
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'

function repoPath(...segments: string[]): string {
  return path.join(process.cwd(), ...segments)
}

const sharedExternalModules = [
  '@nestjs/microservices',
  '@nestjs/microservices/microservices-module',
  '@nestjs/websockets/socket-module',
  'class-transformer/storage',
]

export function createNodejsBundling(
  options: {
    afterBundling?: nodejs.ICommandHooks['afterBundling']
    nodeModules?: string[]
    forceDockerBundling?: boolean
    preCompilation?: boolean
  } = {},
): nodejs.BundlingOptions {
  return {
    preCompilation: options.preCompilation ?? true,
    bundleAwsSDK: true,
    externalModules: sharedExternalModules,
    keepNames: true,
    minify: false,
    sourceMap: true,
    target: 'node24',
    tsconfig: repoPath('tsconfig.json'),
    ...(options.nodeModules ? { nodeModules: options.nodeModules } : {}),
    ...(options.forceDockerBundling ? { forceDockerBundling: true } : {}),
    commandHooks: {
      beforeBundling: () => [],
      beforeInstall: () => [],
      afterBundling: options.afterBundling ?? (() => []),
    },
  }
}

export function sourceEntryPath(...segments: string[]): string {
  return repoPath('src', ...segments)
}

export function removeGeneratedSourceArtifacts(): string[] {
  return [
    process.platform === 'win32'
      ? 'powershell -NoProfile -Command "Get-ChildItem -Path src -Recurse -Include *.js,*.js.map,*.d.ts | Remove-Item -Force"'
      : 'find src \\( -name "*.js" -o -name "*.js.map" -o -name "*.d.ts" \\) -delete',
  ]
}
