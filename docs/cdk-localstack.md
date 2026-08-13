# CDK with LocalStack

Repo nay da duoc scaffold them mot CDK app de thay the flow SAM khi deploy Lambda CRUD cho products va categories len LocalStack. Stack hien nay cung tao them API Gateway REST API v1 de expose ca hai nhom endpoint qua HTTP.

## Files moi

- `cdk.json`
- `bin/localstack-lambdas.ts`
- `lib/localstack-lambdas-stack.ts`
- `scripts/build-lambdas.cjs`

## Cach no hoat dong

1. `npm run cdk:build:lambdas`
   Bundle cac Lambda entrypoints bang `esbuild` vao `dist-lambda/<function-name>/index.js`.
2. `npm run cdk:deploy:local`
   CDK synth stack va deploy vao LocalStack bang `aws-cdk-local`.
3. Stack dung `AWS::Lambda::Function` + `S3Bucket=hot-reload`
   Day la co che LocalStack hot reload, tranh phu thuoc vao CDK asset upload.
4. Stack tao REST API v1 voi explicit routes cho products va categories
   API Gateway goi tung Lambda qua Lambda proxy integration, va entrypoint Lambda map request HTTP thang vao business handler.

## Scripts

- `npm run cdk:build:lambdas`
- `npm run cdk:synth`
- `npm run cdk:deploy:local`
- `npm run cdk:destroy:local`

## Docker Compose

`docker-compose.yml` can bat them service `apigateway` vi file nay dang gioi han service list LocalStack.

Neu vua sua service list, recreate container truoc khi deploy:

```powershell
docker compose up -d --force-recreate
```

## Luu y quan trong khi migrate tu SAM

Neu SAM stack cu van con ton tai, CDK se khong tao duoc function moi neu trung `FunctionName`.

Trong LocalStack hien tai cua repo nay, stack SAM dang ton tai:

- `dynamodb-learning-lambdas-local`

Va cac product function cung dang ton tai:

- `CreateProductFunction`
- `ListProductsFunction`
- `GetProductFunction`
- `UpdateProductFunction`
- `DeleteProductFunction`

Vi vay, truoc khi CDK takeover cung ten function, hay xoa stack SAM cu:

```powershell
aws cloudformation delete-stack `
  --endpoint-url http://localhost:4566 `
  --region ap-southeast-1 `
  --stack-name dynamodb-learning-lambdas-local
```

Neu can, cho stack xoa xong roi deploy lai:

```powershell
npm.cmd run cdk:deploy:local
```

## API Gateway routes

REST API v1 duoc tao voi stage `local` va cac routes:

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

Stack output them `ProductsApiBaseUrl`. Lay URL sau deploy:

```powershell
aws cloudformation describe-stacks `
  --endpoint-url http://localhost:4566 `
  --region ap-southeast-1 `
  --stack-name DynamodbLearningLambdasLocalStack `
  --query "Stacks[0].Outputs[?OutputKey=='ProductsApiBaseUrl'].OutputValue" `
  --output text
```

Vi du test nhanh bang `curl`:

```powershell
$BASE_URL = aws cloudformation describe-stacks `
  --endpoint-url http://localhost:4566 `
  --region ap-southeast-1 `
  --stack-name DynamodbLearningLambdasLocalStack `
  --query "Stacks[0].Outputs[?OutputKey=='ProductsApiBaseUrl'].OutputValue" `
  --output text

curl.exe -X POST "$BASE_URL/products" `
  -H "Content-Type: application/json" `
  -d "{\"name\":\"API Gateway Speaker\",\"description\":\"Created through LocalStack API Gateway.\",\"categoryId\":\"audio\",\"price\":799000,\"status\":\"ACTIVE\"}"
```

```powershell
curl.exe "$BASE_URL/products?limit=10&categoryId=audio"
```

```powershell
curl.exe "$BASE_URL/categories?limit=10"
```

Response HTTP layer tra ve REST-style payload:

- success create/list/get/update: body la du lieu thuc te
- success delete: `204 No Content`
- error: `{ "error": { "code", "message", "details?" } }`

## Ghi chu compatibility

- `aws-cdk-local` dang nhay cam voi cac version `aws-cdk` moi hon.
- Repo nay da pin `aws-cdk` va `aws-cdk-lib` ve `2.176.0` de flow LocalStack on dinh hon.
- Theo docs LocalStack hien tai, neu `aws-cdk-local` gap van de tren may ban, uu tien cai `aws-cdk-local` global.
