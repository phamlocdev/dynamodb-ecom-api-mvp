# DynamoDB E-commerce Learning MVP

NestJS REST API for learning DynamoDB with LocalStack. The server can run in two modes:

- Local NestJS HTTP server for development.
- AWS Lambda behind API Gateway REST API v1, deployed to LocalStack with AWS CDK.

## LocalStack Lambda flow

1. Create `.env` and set `LOCALSTACK_AUTH_TOKEN` if your LocalStack image requires it.
2. Install dependencies: `npm install`
3. Start LocalStack: `docker compose up -d`
4. Bootstrap CDK assets in LocalStack once: `npm run infra:bootstrap`
5. Deploy infrastructure and DynamoDB tables: `npm run infra:deploy`
6. Seed demo data: `npm run db:seed`
7. Use the `LocalStackApiGatewayUrl` printed by CDK output to call the API through LocalStack.
   If local DNS does not resolve, use `LocalStackApiGatewayFallbackUrl`.

Useful commands:

```bash
npm run infra:synth
npm run infra:bootstrap
npm run infra:deploy
npm run infra:destroy
```

## Local NestJS development

Run the same API directly on your machine:

```bash
npm run start:dev
```

Local API: <http://localhost:8000>

Swagger is local-only: <http://localhost:8000/api>

`npm run db:setup` is kept as a manual fallback for creating tables outside CDK. The recommended path is `npm run infra:deploy`.

## Endpoints

| Method   | Endpoint                   | Purpose                                            |
| -------- | -------------------------- | -------------------------------------------------- |
| `GET`    | `/health`                  | Check NestJS and LocalStack DynamoDB connectivity. |
| `POST`   | `/products`                | Create a product with VND integer price.           |
| `GET`    | `/products`                | List products with cursor pagination and filters.  |
| `GET`    | `/products/{productId}`    | Get one product by primary key.                    |
| `PATCH`  | `/products/{productId}`    | Update mutable product fields.                     |
| `DELETE` | `/products/{productId}`    | Delete a product.                                  |
| `POST`   | `/categories`              | Create a category with a stable slug.              |
| `GET`    | `/categories`              | List categories.                                   |
| `GET`    | `/categories/{categoryId}` | Get one category.                                  |
| `PATCH`  | `/categories/{categoryId}` | Update category name or description.               |
| `DELETE` | `/categories/{categoryId}` | Delete a category.                                 |
