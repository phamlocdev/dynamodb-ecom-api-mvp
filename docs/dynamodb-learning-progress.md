# DynamoDB Learning Progress — E-commerce MVP

> **Single source of truth** for learning progress. Update this file at the
> end of every delivered learning unit.

## Learner contract

| Topic | Agreed direction |
| --- | --- |
| Stack | NestJS, TypeScript, REST API, Swagger, AWS SDK v3, LocalStack DynamoDB |
| Domain | Categories, Products, Cart, Orders, Inventory |
| Initial data design | Multi-table design |
| Later refactor | Single-table design, after the multi-table MVP works |
| First vertical slice | Product/Category CRUD and a unified script that reseeds 400 products and 40 categories |
| Currency | VND; monetary values use integer `price` values, e.g. `199000` |
| Identity before auth | A caller supplies a demo `customerId` for cart/order APIs |
| Deferred features | AuthN/AuthZ, automated tests, product search, advanced filters, pagination, GSIs |
| Verification | Focused build/script/LocalStack/Swagger checks; tests only when requested or necessary |

## Current position

| Field | Value |
| --- | --- |
| Active unit | Unit 7 — `carts` and `cart_items`: composite keys and querying one cart |
| Status | `not_started` |
| Completed implementation evidence | Units 1–6: NestJS/Swagger baseline, `products` and `categories` tables, Product/Category CRUD, and the unified reseed script are implemented. Latest seed target is 400 products and 40 categories. |
| Repository observation | The e-commerce NestJS app is newly bootstrapped at repository root. Git tracking was intentionally removed by the learner before implementation. |
| Next delivery | Model `carts` and `cart_items` with a composite primary key, then query one customer's cart. |

## Roadmap status

- [x] Unit 0 — Define the e-commerce learning contract and multi-table MVP plan
- [x] Unit 1 — LocalStack connection, DynamoDB client, health check, and Swagger baseline
- [x] Unit 2 — `products` table: primary key and idempotent table setup
- [x] Unit 3 — Product create/read APIs: `PutItem`, `GetItem`, validation, Swagger
- [x] Unit 4 — Product update/delete: `UpdateItem`, `DeleteItem`, conditional writes
- [x] Unit 5 — Seed products/categories and list products with `Scan`; understand its limits
- [x] Unit 6 — `categories` table and the Product–Category relationship
- [ ] Unit 7 — `carts` and `cart_items`: composite keys and querying one cart
- [ ] Unit 8 — `orders` and `order_items`: immutable records and denormalized snapshots
- [ ] Unit 9 — `inventory`: conditional stock changes and DynamoDB transactions
- [ ] Unit 10 — Product listing evolution: cursor pagination, GSI, category filter, search trade-offs
- [ ] Unit 11 — Reliability and operations: error mapping, retries, capacity/cost concepts, TTL, LocalStack debugging
- [ ] Unit 12 — Design and execute the multi-table → single-table refactor

## Delivery log

| Unit | Status | Evidence | Next concept |
| --- | --- | --- | --- |
| 0 | `completed` | Scope and learning design accepted; `docs/ecommerce-mvp-roadmap.md` records the implementation plan. | LocalStack/DynamoDB baseline |
| 1 | `mastered` | Root NestJS app, `/api` Swagger, global validation, reusable `DynamoDBDocumentClient`, and `GET /health` returning `{"status":"ok","dynamodb":"ok"}` against LocalStack. | Table primary key and idempotent creation |
| 2 | `mastered` | `npm.cmd run db:setup:products` created `products`; a second run verified the same `productId` HASH schema without creating a duplicate. | `PutItem` and `GetItem` |
| 3 | `mastered` | Swagger `POST /products` generated a UUID Product with integer VND price; `GET /products/{productId}` read the same item. DTO validation and 404 mapping are documented. | `UpdateItem` and `DeleteItem` |
| 4 | `mastered` | Swagger `PATCH` changed price/status and returned the updated item; `DELETE` returned 204; GET after deletion returned 404. | Batch write, seed idempotency, and `Scan` |
| 5 | `mastered` | First product seed: `created=200, skipped=0`; second seed: `created=0, skipped=200`; direct DynamoDB `Scan` and `GET /products` both confirmed 200 records. Seed script later generalized to reseed all seed tables with 400 products and 40 categories. | Categories table and references |
| 6 | `mastered` | Refactored table creation to idempotent `npm.cmd run db:setup`; it verified `products`, created `categories`, then verified both tables on a second run. Swagger Category CRUD created `electronics`, updated/deleted a temporary category, and confirmed GET-after-delete is 404. | Cart PK/SK and `Query` |

## Progress-update template

Copy this block when completing a unit:

```md
### Unit N — <name>

- Status: `mastered`
- Implemented: <routes/tables/scripts changed>
- Verified: <exact command, Swagger call, or LocalStack observation>
- Concepts learned: <short list>
- Beginner pitfalls:
  - <question/confusion> — <answer and mental model>
- Next suggested unit: <name>
```

## Concepts to revisit

- DynamoDB is designed from **access patterns**, not from normalized entities.
- A table's attribute definitions describe only attributes used by its primary
  key or indexes; they are not an SQL-style column schema.
- `GetItem` needs the full primary key. `Scan` reads every item considered by
  the operation and is therefore not the long-term solution for a catalogue.
- VND price is stored as an integer amount. Avoid floating-point values for
  money.

## Units 1–5 — Beginner pitfalls (Tiếng Việt)

- **“Có `LOCALSTACK_AUTH_TOKEN` là ứng dụng tự biết DynamoDB endpoint?”** Không.
  Token được Docker Compose truyền cho container LocalStack; NestJS vẫn cần
  endpoint, region và credentials SDK (có default an toàn cho local) để gọi
  DynamoDB. Mental model: Docker-container configuration và AWS SDK client
  configuration là hai lớp khác nhau.
- **“`products` không khai báo `name`, `price`, `status` lúc CreateTable có sai không?”**
  Không. DynamoDB chỉ khai báo attributes tham gia primary key hoặc index;
  những attributes còn lại xuất hiện cùng item khi `PutItem`. Mental model:
  schema key cố định, dữ liệu không-key linh hoạt.
- **“`PATCH` trước Get rồi mới Update có dễ hiểu hơn không?”** Có thể, nhưng hai
  request tạo race condition. `ConditionExpression: attribute_exists` để chính
  DynamoDB xác nhận item tồn tại ngay khi update/delete. Mental model: điều
  kiện được kiểm tra nguyên tử cùng thao tác write.
- **“Seed chạy lại sao không dùng BatchWrite để luôn ghi đè 200 item?”** `BatchWrite`
  không hỗ trợ condition expression. Script đọc keys trước và chỉ batch-write
  item thiếu để không làm mất chỉnh sửa manual. Mental model: idempotent nghĩa
  chạy lại vẫn cho trạng thái kết quả an toàn, không chỉ là không báo lỗi.
- **“200 item đã list được bằng Scan, vậy dùng Scan luôn được chứ?”** Không nên.
  `Scan` đọc toàn bộ items xem xét và không cam kết thứ tự; catalogue lớn cần
  access pattern, `Query`, pagination và thường là GSI. Mental model: `Scan`
  là công cụ học/tập dữ liệu nhỏ, không phải catalogue query dài hạn.

## Unit 6 — Category relationship contract and beginner pitfalls

### Relationship contract

- `categories.categoryId` is the partition key and is a stable lowercase slug,
  such as `electronics`.
- `products.categoryId` is a **soft reference**. It is stored as a normal
  string attribute and Product CRUD does not call `GetItem` on `categories` to
  verify it.
- DynamoDB has no foreign key, join, or cascade delete here. Deleting a
  Category does not rewrite Products with that `categoryId`.
- The unified seed script creates 40 Category records and 400 Product records.
  Seeded Products reference one of those Category slugs.

### Beginner pitfalls (Tiếng Việt)

- **“`categoryId` trong Product có nghĩa DynamoDB tự kiểm tra Category tồn tại?”**
  Không. Đây chỉ là string reference do application quy ước. Mental model:
  DynamoDB không cung cấp foreign key như relational database.
- **“Một file `setup-database.ts` nghĩa là single-table design?”** Không. Một
  script có thể tạo nhiều physical tables; multi-table hay single-table là
  quyết định data model, không phải số file setup.
- **“Xóa Category thì DynamoDB tự xóa Product cùng categoryId?”** Không. Không
  có cascade. Mental model: nếu cần referential integrity, application phải
  thiết kế explicit validation, cleanup flow, hoặc transaction phù hợp.
