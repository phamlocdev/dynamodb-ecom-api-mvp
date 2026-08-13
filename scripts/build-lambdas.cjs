const path = require('node:path')
const { build } = require('esbuild')

const projectRoot = path.resolve(__dirname, '..')
const outputRoot = path.join(projectRoot, 'dist-lambda')

const entries = [
  ['create-product', 'src/lambda/entrypoints/create-product.ts'],
  ['list-products', 'src/lambda/entrypoints/list-products.ts'],
  ['get-product', 'src/lambda/entrypoints/get-product.ts'],
  ['update-product', 'src/lambda/entrypoints/update-product.ts'],
  ['delete-product', 'src/lambda/entrypoints/delete-product.ts'],
  ['create-category', 'src/lambda/entrypoints/create-category.ts'],
  ['list-categories', 'src/lambda/entrypoints/list-categories.ts'],
  ['get-category', 'src/lambda/entrypoints/get-category.ts'],
  ['update-category', 'src/lambda/entrypoints/update-category.ts'],
  ['delete-category', 'src/lambda/entrypoints/delete-category.ts'],
]

async function main() {
  await Promise.all(
    entries.map(async ([name, entry]) =>
      build({
        entryPoints: [path.join(projectRoot, entry)],
        bundle: true,
        platform: 'node',
        target: 'node22',
        format: 'cjs',
        sourcemap: true,
        outfile: path.join(outputRoot, name, 'index.js'),
      }),
    ),
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
