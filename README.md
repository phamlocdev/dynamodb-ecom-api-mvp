# DynamoDB E-commerce Learning MVP

NestJS REST API để học DynamoDB với LocalStack. Giai đoạn hiện tại hoàn tất
Product/Category CRUD và seed catalogue 400 sản phẩm, 40 danh mục theo multi-table design.

## Chạy project

1. Tạo `.env` từ `.env.example` nếu chưa có. `LOCALSTACK_AUTH_TOKEN` phải được
   đặt trong `.env` để Docker Compose truyền token vào LocalStack.
2. Cài dependencies: `npm.cmd install`
3. Khởi động DynamoDB LocalStack: `docker compose up -d`
4. Tạo toàn bộ DynamoDB tables (an toàn khi chạy lặp): `npm.cmd run db:setup`
5. Reseed all tables (replace existing seed-table data): `npm.cmd run db:seed`
6. Chạy API: `npm.cmd run start:dev`

Swagger: <http://localhost:8000/api>

## Endpoints hiện có

| Method   | Endpoint                   | Mục đích                                          |
| -------- | -------------------------- | ------------------------------------------------- |
| `GET`    | `/health`                  | Xác minh NestJS kết nối được LocalStack DynamoDB  |
| `POST`   | `/products`                | Tạo Product với giá VND integer                   |
| `GET`    | `/products`                | Liệt kê catalogue bằng DynamoDB `Scan`            |
| `GET`    | `/products/{productId}`    | Lấy một Product theo primary key                  |
| `PATCH`  | `/products/{productId}`    | Cập nhật một hay nhiều trường Product             |
| `DELETE` | `/products/{productId}`    | Xoá Product                                       |
| `POST`   | `/categories`              | Tạo Category với stable slug, ví dụ `electronics` |
| `GET`    | `/categories`              | Liệt kê Categories                                |
| `GET`    | `/categories/{categoryId}` | Lấy một Category                                  |
| `PATCH`  | `/categories/{categoryId}` | Cập nhật tên hoặc mô tả Category                  |
| `DELETE` | `/categories/{categoryId}` | Xoá Category; không cascade sang Products         |

`GET /products` chưa có filter, search, sort hay pagination. Đây là giới hạn
có chủ đích để học `Scan` trước khi thiết kế GSI/`Query` ở các unit tiếp theo.
