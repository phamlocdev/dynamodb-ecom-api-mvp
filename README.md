# DynamoDB E-commerce Learning MVP

NestJS REST API for learning DynamoDB with LocalStack.

## Current Setup

- NestJS app exposes REST endpoints for `products`, `categories`, and `health`
- Product and category CRUD are also deployed to LocalStack as Lambda functions behind API Gateway REST API v1
- Lambda code is bundled with `esbuild` and deployed through CDK using LocalStack hot reload

## Local Development

1. Create `.env` from `.env.example` if needed.
2. Install dependencies: `npm.cmd install`
3. Start LocalStack: `docker compose up -d --force-recreate`
4. Create tables: `npm.cmd run db:setup`
5. Seed data if needed: `npm.cmd run db:seed`
6. Run the Nest app: `npm.cmd run start:dev`

Swagger UI: <http://localhost:8000/api>

## Deploy Catalog Lambdas to LocalStack

1. Make sure `docker-compose.yml` includes `dynamodb`, `lambda`, `iam`, `logs`, `cloudformation`, `s3`, `sts`, and `apigateway`
2. Bundle Lambda entrypoints: `npm.cmd run cdk:build:lambdas`
3. Deploy the CDK stack: `npm.cmd run cdk:deploy:local`

Important parameters passed by the deploy script:

- `ProductsTableName=products`
- `CategoriesTableName=categories`
- `DynamoDbEndpoint=http://localhost.localstack.cloud:4566`

`localhost.localstack.cloud` is used so Lambda containers inside LocalStack can still reach the LocalStack edge endpoint.

## Test Catalog API on LocalStack

Read the API base URL from the stack output:

```powershell
$BASE_URL = aws cloudformation describe-stacks `
  --endpoint-url http://localhost:4566 `
  --region ap-southeast-1 `
  --stack-name DynamodbLearningLambdasLocalStack `
  --query "Stacks[0].Outputs[?OutputKey=='ProductsApiBaseUrl'].OutputValue" `
  --output text
```

Example requests:

```powershell
curl.exe "$BASE_URL/products?limit=10"
```

```powershell
curl.exe -X POST "$BASE_URL/products" `
  -H "Content-Type: application/json" `
  -d "{\"name\":\"API Gateway Speaker\",\"description\":\"Created through LocalStack API Gateway.\",\"categoryId\":\"audio\",\"price\":799000,\"status\":\"ACTIVE\"}"
```

```powershell
curl.exe "$BASE_URL/categories?limit=10"
```

```powershell
curl.exe -X POST "$BASE_URL/categories" `
  -H "Content-Type: application/json" `
  -d "{\"categoryId\":\"localstack-demo\",\"name\":\"LocalStack Demo\",\"description\":\"Created through LocalStack API Gateway.\"}"
```

## API Routes

- `POST /products`
- `GET /products`
- `GET /products/{productId}`
- `PATCH /products/{productId}`
- `DELETE /products/{productId}`
- `POST /categories`
- `GET /categories`
- `GET /categories/{categoryId}`
- `PATCH /categories/{categoryId}`
- `DELETE /categories/{categoryId}`

## Notes

- This repo keeps `aws-cdk` and `aws-cdk-lib` pinned to `2.176.0` because `aws-cdk-local` is sensitive to newer versions.
- API Gateway is the only supported entrypoint for the catalog Lambdas in the current LocalStack flow.
