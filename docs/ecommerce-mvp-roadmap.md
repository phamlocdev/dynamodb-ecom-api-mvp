# E-commerce MVP — DynamoDB Learning Roadmap

## 1. Outcome

Build a small but usable e-commerce REST API that can be exercised entirely
from Swagger. The project is intentionally a learning vehicle: each API is
introduced when it demonstrates a DynamoDB access pattern or safety concept.

The final learning outcome has two stages:

1. A working multi-table e-commerce MVP with the basic domain flows.
2. A deliberate refactor of the same access patterns to a single-table design,
   including a comparison of the benefits and trade-offs.

## 2. Scope decisions

### In scope

- NestJS REST APIs with Swagger documentation.
- DynamoDB running in LocalStack through the repository's Docker Compose setup.
- Categories, Products, Cart, Orders, and Inventory.
- A standalone, repeatable product seed command for about 200 products.
- VND pricing stored as integers.
- Manual API checks and small scripts as learning verification.

### Explicitly deferred

- Authentication and authorization.
- Product search, advanced filtering, sorting, cursor pagination, and GSIs.
- Automated unit/integration testing.
- Payment gateway, promotion, wishlist, reviews, images uploaded to object storage,
  multi-warehouse stock, and production deployment.

## 3. Multi-table design (target state)

The initial design favours clarity: each primary domain concern receives its
own table. This makes table keys and the command used by each endpoint easy to
observe before learning the extra constraints of single-table design.

| Table | Primary key | Purpose | First important access pattern |
| --- | --- | --- | --- |
| `products` | `productId` (PK) | Product catalogue records | Get one product by ID |
| `categories` | `categoryId` (PK) | Product categories | Get a category by ID |
| `carts` | `customerId` (PK) | One active-cart summary per demo customer | Get one customer's cart |
| `cart_items` | `customerId` (PK), `productId` (SK) | Items within a customer's cart | Query all cart items for a customer |
| `orders` | `orderId` (PK) | Order header/status/total | Get an order by ID |
| `order_items` | `orderId` (PK), `productId` (SK) | Immutable product snapshot at order time | Query all items in an order |
| `inventory` | `productId` (PK) | Available quantity for a product | Get/update stock by product ID |

### Why no Product GSI initially?

The only immediate Product APIs are CRUD by `productId` and a simple list. A
GSI would not serve a confirmed access pattern yet. The list endpoint will use
`Scan` in Unit 5 so its behavior and limitations are visible. In Unit 10 we
will add the necessary index only after committing to concrete category-listing
or status-listing queries.

### Product item contract (initial)

```ts
{
  productId: string,       // UUID
  name: string,
  description: string,
  categoryId: string,      // a reference; validation against categories comes later
  price: number,           // VND integer, e.g. 199000
  currency: 'VND',
  imageUrl?: string,
  status: 'ACTIVE' | 'INACTIVE',
  createdAt: string,       // ISO-8601 UTC
  updatedAt: string        // ISO-8601 UTC
}
```

`availableQuantity` is deliberately excluded. It belongs to `inventory`, so a
later stock-safety lesson does not become hidden in a product update.

## 4. API plan

### First deliverable — Products CRUD

| Method | Endpoint | DynamoDB command | Swagger test outcome |
| --- | --- | --- | --- |
| `POST` | `/products` | `PutItem` | Creates and returns a VND-priced product |
| `GET` | `/products` | `Scan` | Lists seeded and manually-created products |
| `GET` | `/products/{productId}` | `GetItem` | Returns one item or a clear 404 |
| `PATCH` | `/products/{productId}` | `UpdateItem` | Updates allowed fields and refreshes `updatedAt` |
| `DELETE` | `/products/{productId}` | `DeleteItem` | Deletes the item; a later GET returns 404 |

The initial list endpoint deliberately has no filter, search, sort, or
pagination. Swagger will document request validation, response examples, and
common 400/404 outcomes.

### Later basic domain APIs

| Domain | Planned endpoints | DynamoDB lesson |
| --- | --- | --- |
| Categories | CRUD `/categories` | Separate table and references |
| Cart | `GET /customers/{customerId}/cart`, add/update/delete cart item | Composite primary key and `Query` |
| Orders | Create order, get one order, list one customer's orders | Immutable order snapshot; later GSI decision |
| Inventory | Get inventory, adjust/reserve stock | Condition expressions and transactions |

Demo cart and order requests will carry a `customerId`; that is an intentional
temporary identity model until authentication is added.

## 5. Learning sequence

| Unit | Build focus | DynamoDB concepts | Completion evidence |
| --- | --- | --- | --- |
| 0 | Agree domain, scope, design, and tracking | Access-pattern-first thinking | This document and progress file |
| 1 | Restore NestJS e-commerce baseline, Swagger, LocalStack client, health endpoint | Endpoint/region/credentials; `DynamoDBDocumentClient` | Health route confirms the LocalStack connection |
| 2 | Create `products` table idempotently | Table PK, `AttributeDefinitions`, `CreateTable`, `DescribeTable` | Setup command may run more than once safely |
| 3 | POST + GET one Product | `PutItem`, `GetItem`, DTO validation, UUID/time fields | Swagger creates then reads a product |
| 4 | PATCH + DELETE Product | `UpdateExpression`, `DeleteItem`, condition expression, 404 mapping | Swagger update/delete workflow works |
| 5 | Seed and list Products | Batch writing, idempotency, `Scan`, scan limitations | Seed command yields about 200 stable records |
| 6 | Categories | References versus joins; application-side validation trade-offs | Category CRUD works |
| 7 | Cart | PK/SK, `Query`, ordered items, cart-item mutation | One customer's cart can be queried without a scan |
| 8 | Orders | Write-time denormalization, immutable purchase snapshots | Order and its lines are read by order ID |
| 9 | Inventory and checkout | `ConditionExpression`, optimistic concurrency, `TransactWriteItems` | Overselling is rejected by a manual race simulation |
| 10 | Better catalogue access | `LastEvaluatedKey`, GSI design, `Query` vs `Scan`, search limitations | Category listing/pagination is justified by an access pattern |
| 11 | Operations | TTL, retry/error handling, consumed capacity, debugging LocalStack | Error scenarios are observable and documented |
| 12 | Single-table refactor | Entity prefixes, composite keys, sparse GSIs, migration strategy | Same core API access patterns run against one table |

## 6. Seed-data contract

The future `db:seed:products` command will:

- generate a deterministic catalogue of roughly 200 realistic products;
- store integer VND prices;
- use stable product IDs so re-running it does not create duplicates;
- use safe batch retries for DynamoDB unprocessed items;
- report how many records were created/updated/skipped; and
- not run automatically when the API starts.

An explicit command makes its effects visible in learning sessions and avoids
surprising changes to LocalStack data while developing an API.

## 7. Manual Swagger acceptance path for the first slice

1. Start LocalStack.
2. Run the idempotent table setup command.
3. Run the explicit product seed command.
4. Start NestJS and open `/api`.
5. Call `GET /products` and see the seeded catalogue.
6. Create a product with `POST /products`.
7. Retrieve it by ID, edit it, then delete it.
8. Confirm the final `GET /products/{productId}` is a 404.

## 8. Refactor checkpoint: multi-table to single-table

Do **not** begin the refactor merely because CRUD works. Start it only after
the basic cart/order/inventory workflow has real access patterns and the
multi-table design has exposed its costs (several reads, application joins,
and cross-table consistency work).

At that checkpoint, write an access-pattern matrix first, then design a table
such as `ecommerce` with generic `PK` and `SK`. Preserve the public API while
switching the persistence adapter, compare request counts and query behavior,
and retain the multi-table implementation as a learning reference until the
comparison is complete.

## 9. Suggested document workflow

- `docs/dynamodb-learning-progress.md`: current unit, status, delivery
  evidence, next topic, and concepts to revisit.
- This document: stable roadmap and target architecture; update only when
  project scope or design decisions change.
- `AGENTS.md`: instructions so future coding sessions respect the active unit
  and update the progress tracker.
