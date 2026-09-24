import * as assert from 'assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as vm from 'vm'
import { transformSync } from 'esbuild'

type Request = {
  uri?: string
}

type RewriteHandler = (event: { request: Request }) => Request

type RewriteCase = {
  input: string
  expected: string
}

const serverRoot = path.resolve(__dirname, '..', '..')
const sourcePath = path.join(serverRoot, 'infra', 'lambda', 'client-rewrite-handler', 'index.ts')
const source = fs.readFileSync(sourcePath, 'utf8')
const code = transformSync(source, {
  loader: 'ts',
  target: 'es2020',
  minify: true,
}).code

const sandbox: {
  console: Console
  __handler?: RewriteHandler
} = { console }

vm.createContext(sandbox)
new vm.Script(`${code}\nthis.__handler = handler;`).runInContext(sandbox)

if (!sandbox.__handler) {
  throw new Error('CloudFront rewrite function did not define a global handler.')
}

const cases: RewriteCase[] = [
  {
    input: '/products/4848fb78-4d16-55e6-ae78-72d3e40fe6d3',
    expected: '/products/4848fb78-4d16-55e6-ae78-72d3e40fe6d3/index.html',
  },
  {
    input: '/products/4848fb78-4d16-55e6-ae78-72d3e40fe6d3/',
    expected: '/products/4848fb78-4d16-55e6-ae78-72d3e40fe6d3/index.html',
  },
  { input: '/', expected: '/index.html' },
  { input: '/_next/static/chunks/main.js', expected: '/_next/static/chunks/main.js' },
  { input: '/favicon.ico', expected: '/favicon.ico' },
  { input: '/products/example-product', expected: '/products/example-product/index.html' },
  { input: '/products/__fallback', expected: '/products/__fallback/index.html' },
  { input: '/products/__template', expected: '/products/__template/index.html' },
  { input: '/orders/payment-return', expected: '/orders/payment-return/index.html' },
  { input: '/orders/order-123', expected: '/orders/order-123/index.html' },
  {
    input: '/orders/c285d05c-6738-4d64-8b11-88ecaad67774',
    expected: '/orders/__fallback/index.html',
  },
  {
    input: '/admin/orders/c285d05c-6738-4d64-8b11-88ecaad67774',
    expected: '/admin/orders/__fallback/index.html',
  },
  { input: '/admin/products/new', expected: '/admin/products/new/index.html' },
  {
    input: '/admin/products/4848fb78-4d16-55e6-ae78-72d3e40fe6d3/edit',
    expected: '/admin/products/__fallback/edit/index.html',
  },
  {
    input: '/admin/users/c285d05c-6738-4d64-8b11-88ecaad67774/access',
    expected: '/admin/users/__fallback/access/index.html',
  },
  { input: '/auth/login', expected: '/auth/login/index.html' },
  { input: '/auth/login/', expected: '/auth/login/index.html' },
]

for (const testCase of cases) {
  const request = sandbox.__handler({ request: { uri: testCase.input } })
  assert.equal(request.uri, testCase.expected, `${testCase.input} should rewrite correctly`)
}

console.log(`Validated ${cases.length} client rewrite cases.`)
