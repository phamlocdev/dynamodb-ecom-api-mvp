# DynamoDB E-commerce Learning MVP

NestJS REST API để học DynamoDB với LocalStack. Repo hiện có:
- REST API cho `products` và `categories`
- shared Product core dùng chung cho Nest controller và Lambda handlers
- SAM template để build/deploy 5 Product Lambda functions

## Chạy REST API hiện tại

1. Tạo `.env` từ `.env.example` nếu chưa có.
2. Cài dependencies: `npm.cmd install`
3. Khởi động LocalStack: `docker compose up -d`
4. Tạo tables: `npm.cmd run db:setup`
5. Seed dữ liệu: `npm.cmd run db:seed`
6. Chạy API: `npm.cmd run start:dev`

Swagger: <http://localhost:8000/api>

## Product Lambdas trong repo

Các handlers nằm ở [`src/lambda/handlers`](D:\innomize\internship\server\src\lambda\handlers:1):
- `create-product`
- `list-products`
- `get-product`
- `update-product`
- `delete-product`

Tất cả handlers:
- không bootstrap Nest app
- dùng lại shared `ProductsCore`
- validate input bằng `class-validator`
- trả response shape:

```json
{
  "success": true,
  "data": {}
}
```

hoặc

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR | NOT_FOUND | CONFLICT | INTERNAL_ERROR",
    "message": "...",
    "details": []
  }
}
```

## Prerequisites cho SAM

Local learning path:
- Docker Desktop
- SAM CLI
- `aws-sam-cli-local` để có lệnh `samlocal`
- AWS CLI để invoke function đã deploy vào LocalStack

Cloud path:
- AWS account
- AWS CLI đã `aws configure`
- SAM CLI

## Build và deploy Lambda lên LocalStack

`docker-compose.yml` hiện cần các services:
- `dynamodb`
- `lambda`
- `iam`
- `logs`
- `cloudformation`
- `s3`

Flow local:

1. Recreate LocalStack sau khi đổi service list:
   `docker compose up -d --force-recreate`
2. Tạo tables:
   `npm.cmd run db:setup`
3. Seed dữ liệu:
   `npm.cmd run db:seed`
4. Build SAM:
   `npm.cmd run sam:build`
5. Deploy lên LocalStack:
   `npm.cmd run sam:deploy:local`

Script deploy local truyền:
- `ProductsTableName=products`
- `DynamoDbEndpoint=http://localhost.localstack.cloud:4566`
- `AwsRegion=ap-southeast-1`
- `AwsAccessKeyId=test`
- `AwsSecretAccessKey=test`

Lý do dùng `localhost.localstack.cloud`:
- Nest app chạy trên host vẫn có thể dùng `http://localhost:4566`
- Lambda container bên trong LocalStack cần một hostname truy cập được LocalStack từ trong container

## Invoke Product Lambdas trên LocalStack

Sample events nằm trong [`events`](D:\innomize\internship\server\events:1).

Invoke commands:
- `npm.cmd run sam:invoke:create`
- `npm.cmd run sam:invoke:list`
- `npm.cmd run sam:invoke:get`
- `npm.cmd run sam:invoke:update`
- `npm.cmd run sam:invoke:delete`

Mỗi lệnh sẽ ghi output vào file:
- `lambda-response-create.json`
- `lambda-response-list.json`
- `lambda-response-get.json`
- `lambda-response-update.json`
- `lambda-response-delete.json`

## Deploy Lambda lên AWS cloud

Bạn **không cần** AWS account để học và chạy LocalStack path.

Bạn **cần** AWS account khi muốn deploy Lambda thật lên AWS cloud.

Flow cloud cơ bản:
1. Sửa parameter `DynamoDbEndpoint` thành chuỗi rỗng hoặc bỏ hẳn local endpoint
2. Đảm bảo Lambda execution role có quyền CloudWatch Logs và DynamoDB
3. Chạy `npm.cmd run sam:build`
4. Chạy `npm.cmd run sam:deploy:aws`
5. SAM sẽ hỏi stack name, region, confirm changeset, capability IAM

Lưu ý cho cloud:
- nếu Lambda chạy với DynamoDB thật trên AWS thì không nên set `DYNAMODB_ENDPOINT`
- nên dùng IAM role của Lambda thay vì hardcode credentials trong environment variables

## Endpoints REST hiện có

| Method   | Endpoint                   | Mục đích                                           |
| -------- | -------------------------- | -------------------------------------------------- |
| `GET`    | `/health`                  | Xác minh NestJS kết nối được LocalStack DynamoDB   |
| `POST`   | `/products`                | Tạo Product với giá VND integer                    |
| `GET`    | `/products`                | Liệt kê catalogue bằng DynamoDB `Scan`             |
| `GET`    | `/products/{productId}`    | Lấy một Product theo primary key                   |
| `PATCH`  | `/products/{productId}`    | Cập nhật một hay nhiều trường Product              |
| `DELETE` | `/products/{productId}`    | Xoá Product                                        |
| `POST`   | `/categories`              | Tạo Category với stable slug, ví dụ `electronics`  |
| `GET`    | `/categories`              | Liệt kê Categories                                 |
| `GET`    | `/categories/{categoryId}` | Lấy một Category                                   |
| `PATCH`  | `/categories/{categoryId}` | Cập nhật tên hoặc mô tả Category                   |
| `DELETE` | `/categories/{categoryId}` | Xoá Category; không cascade sang Products          |
