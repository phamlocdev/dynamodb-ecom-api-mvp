# CDK with LocalStack

Repo nay da duoc scaffold them mot CDK app de thay the flow SAM khi deploy 5 product lambdas len LocalStack.

## Files moi

- `cdk.json`
- `bin/localstack-lambdas.ts`
- `lib/localstack-lambdas-stack.ts`
- `scripts/build-lambdas.cjs`

## Cach no hoat dong

1. `npm run cdk:build:lambdas`
   Bundle 5 Lambda entrypoints bang `esbuild` vao `dist-lambda/<function-name>/index.js`.
2. `npm run cdk:deploy:local`
   CDK synth stack va deploy vao LocalStack bang `aws-cdk-local`.
3. Stack dung `AWS::Lambda::Function` + `S3Bucket=hot-reload`
   Day la co che LocalStack hot reload, tranh phu thuoc vao CDK asset upload.

## Scripts

- `npm run cdk:build:lambdas`
- `npm run cdk:synth`
- `npm run cdk:deploy:local`
- `npm run cdk:destroy:local`
- `npm run cdk:invoke:create`
- `npm run cdk:invoke:list`
- `npm run cdk:invoke:get`
- `npm run cdk:invoke:update`
- `npm run cdk:invoke:delete`

## Luu y quan trong khi migrate tu SAM

Neu SAM stack cu van con ton tai, CDK se khong tao duoc function moi neu trung `FunctionName`.

Trong LocalStack hien tai cua repo nay, stack SAM dang ton tai:

- `dynamodb-learning-lambdas-local`

Va cac function cung dang ton tai:

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

## Verify

Sau khi deploy, invoke nhu truoc:

```powershell
npm.cmd run cdk:invoke:list
```

## Ghi chu compatibility

- `aws-cdk-local` dang nhay cam voi cac version `aws-cdk` moi hon.
- Repo nay da pin `aws-cdk` va `aws-cdk-lib` ve `2.176.0` de flow LocalStack on dinh hon.
- Theo docs LocalStack hien tai, neu `aws-cdk-local` gap van de tren may ban, uu tien cai `aws-cdk-local` global.
