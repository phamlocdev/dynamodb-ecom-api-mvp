# DynamoDB E-commerce Learning MVP

NestJS e-commerce API running on AWS: Lambda, API Gateway HTTP API, DynamoDB, SQS, EventBridge, S3, and Cognito.

## AWS development flow

1. Configure AWS CLI credentials for your account and region.
2. Copy `.env.example` to `.env.dev`; provide your account ID and globally unique S3/Cognito names.
3. Install dependencies: `npm install`.
4. Validate the template: `npm run infra:synth`.
5. Bootstrap CDK once per account/region: `npm run infra:bootstrap -- aws://<account-id>/ap-southeast-1`.
6. Deploy: `npm run infra:deploy`.
7. Use the `ApiGatewayUrl` from `aws-outputs.json`.

Useful commands:

```bash
npm run infra:synth
npm run infra:bootstrap
npm run infra:deploy
npm run infra:destroy
```

Lambda functions use their IAM execution roles. Do not place AWS access keys in `.env.dev`.

## Local NestJS development

`npm run start:dev` runs the API locally but calls actual AWS services using your configured AWS credentials. Swagger is available at <http://localhost:8000/api>.

## Endpoints

| Method | Endpoint                | Purpose                                           |
| ------ | ----------------------- | ------------------------------------------------- |
| `GET`  | `/health`               | Check NestJS and Amazon DynamoDB connectivity.    |
| `POST` | `/products`             | Create a product with VND integer price.          |
| `GET`  | `/products`             | List products with cursor pagination and filters. |
| `GET`  | `/products/{productId}` | Get one product by primary key.                   |
| `POST` | `/orders`               | Place an order asynchronously through SQS.        |
