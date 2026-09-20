import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb'
import { EventBridgeEvent } from 'aws-lambda'

type ProductEventDetailType = 'ProductCreated' | 'ProductUpdated' | 'ProductDeleted'

type ProductEventDetail = {
  productId?: string
}

type Product = {
  productId: string
  name: string
  description: string
  categoryId: string
  price: number
  currency: string
  imageUrl?: string
  status: string
  createdAt: string
  updatedAt: string
}

const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'ap-southeast-1'
const productsTable = requireEnv('PRODUCTS_TABLE')
const siteBucket = requireEnv('CLIENT_SITE_BUCKET')
const distributionId = requireEnv('CLIENT_DISTRIBUTION_ID')
const clientBaseUrl = requireEnv('CLIENT_BASE_URL').replace(/\/$/, '')
const templateKey = process.env.PRODUCT_TEMPLATE_KEY ?? 'products/__template/index.html'

const s3Client = new S3Client({ region })
const dynamoDbDocumentClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region }))
const cloudFrontClient = new CloudFrontClient({ region: 'us-east-1' })

export async function handler(
  event: EventBridgeEvent<ProductEventDetailType, ProductEventDetail>,
): Promise<void> {
  const productId = normalizeProductId(event.detail.productId)
  const productKey = getProductPageKey(productId)

  console.log(`Processing product event: ${event['detail-type']} for productId: ${productId}`)

  if (event['detail-type'] === 'ProductDeleted') {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: siteBucket,
        Key: productKey,
      }),
    )
    await invalidateProductPaths(productId)

    console.log(`Invalidated product paths for productId: ${productId}`)
    return
  }

  const product = await getProduct(productId)
  const template = await getTemplate()
  const html = renderProductHtml(template, product)

  await s3Client.send(
    new PutObjectCommand({
      Bucket: siteBucket,
      Key: productKey,
      Body: html,
      ContentType: 'text/html; charset=utf-8',
      CacheControl: 'public, max-age=60, stale-while-revalidate=300',
    }),
  )

  await invalidateProductPaths(productId)
}

async function getProduct(productId: string): Promise<Product> {
  const response = await dynamoDbDocumentClient.send(
    new GetCommand({
      TableName: productsTable,
      Key: { productId },
    }),
  )

  if (!response.Item) {
    throw new Error(`Product ${productId} was not found.`)
  }

  return response.Item as Product
}

async function getTemplate(): Promise<string> {
  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: siteBucket,
      Key: templateKey,
    }),
  )

  if (!response.Body) {
    throw new Error(`Template ${templateKey} was empty.`)
  }

  return response.Body.transformToString()
}

function renderProductHtml(template: string, product: Product): string {
  const productUrl = `${clientBaseUrl}/products/${encodeURIComponent(product.productId)}`
  const title = `${product.name} | DynamoDB MVP Storefront`
  const description = product.description || `${product.name} product details.`
  const publicImageUrl = isPublicUrl(product.imageUrl) ? product.imageUrl : undefined
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description,
    sku: product.productId,
    category: product.categoryId,
    ...(publicImageUrl ? { image: [publicImageUrl] } : {}),
    offers: {
      '@type': 'Offer',
      price: product.price,
      priceCurrency: product.currency || 'VND',
      availability:
        product.status === 'ACTIVE'
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
      url: productUrl,
    },
  }

  const seoHead = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeAttribute(description)}">`,
    `<link rel="canonical" href="${escapeAttribute(productUrl)}">`,
    `<meta property="og:type" content="product">`,
    `<meta property="og:title" content="${escapeAttribute(product.name)}">`,
    `<meta property="og:description" content="${escapeAttribute(description)}">`,
    `<meta property="og:url" content="${escapeAttribute(productUrl)}">`,
    publicImageUrl ? `<meta property="og:image" content="${escapeAttribute(publicImageUrl)}">` : '',
    `<meta name="twitter:card" content="${publicImageUrl ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${escapeAttribute(product.name)}">`,
    `<meta name="twitter:description" content="${escapeAttribute(description)}">`,
    publicImageUrl
      ? `<meta name="twitter:image" content="${escapeAttribute(publicImageUrl)}">`
      : '',
    `<script id="product-json-ld" type="application/ld+json">${escapeScriptJson(jsonLd)}</script>`,
  ]
    .filter(Boolean)
    .join('')

  const fallbackBody = [
    '<noscript>',
    '<main>',
    `<h1>${escapeHtml(product.name)}</h1>`,
    `<p>${escapeHtml(description)}</p>`,
    `<p>${escapeHtml(formatPrice(product.price, product.currency))}</p>`,
    '</main>',
    '</noscript>',
  ].join('')

  return template
    .replace(/<title>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta\s+name=["']description["'][^>]*>/gi, '')
    .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '')
    .replace(/<meta\s+(?:property|name)=["'](?:og:[^"']+|twitter:[^"']+)["'][^>]*>/gi, '')
    .replace(/<script\s+id=["']product-json-ld["'][\s\S]*?<\/script>/gi, '')
    .replace('</head>', `${seoHead}</head>`)
    .replace(/<body([^>]*)>/i, `<body$1>${fallbackBody}`)
}

async function invalidateProductPaths(productId: string): Promise<void> {
  await cloudFrontClient.send(
    new CreateInvalidationCommand({
      DistributionId: distributionId,
      InvalidationBatch: {
        CallerReference: `${productId}-${Date.now()}`,
        Paths: {
          Quantity: 2,
          Items: [`/products/${productId}`, `/products/${productId}/index.html`],
        },
      },
    }),
  )
}

function getProductPageKey(productId: string): string {
  return `products/${productId}/index.html`
}

function normalizeProductId(productId: string | undefined): string {
  if (!productId || productId.includes('/') || productId.includes('\\')) {
    throw new Error('Product event detail.productId is required and must not contain slashes.')
  }

  return productId
}

function isPublicUrl(value: string | undefined): value is string {
  if (!value) {
    return false
  }

  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function formatPrice(price: number, currency: string): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: currency || 'VND',
  }).format(price)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, '&#96;')
}

function escapeScriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is required.`)
  }

  return value
}
