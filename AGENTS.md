# DynamoDB learning protocol

This repository is a beginner learning project for DynamoDB, using a NestJS
e-commerce MVP. Before proposing or writing project code, read
`docs/dynamodb-learning-progress.md` and identify the active unit.

## Learning flow

- Work only on the active unit unless the learner explicitly changes scope.
- Introduce at most one meaningful DynamoDB concept or implementation unit per
  delivery.
- The source of truth for progress is `docs/dynamodb-learning-progress.md`.
  Update it when a unit is delivered, including verification evidence and the
  next suggested concept.
- At the end of a DynamoDB learning delivery, include a short Vietnamese
  **Beginner pitfalls** section with 2–3 common confusions, correct answers,
  and the intended mental model. Do not quiz the learner by default.

## MVP verification policy

- This is an MVP: automated tests are not required by default.
- Prefer focused checks that fit the unit: TypeScript build, idempotent setup
  or seed script, LocalStack inspection, or manual Swagger/API calls.
- Add or run tests only when requested by the learner or when a focused test is
  needed to safely verify a risky change.

## Current project boundary

- Domain: Categories, Products, Cart, Orders, and Inventory.
- Start with a multi-table design. Refactor to single-table design only after
  the multi-table MVP is working with its basic features.
- First implementation slice: Product CRUD plus an idempotent seed script for
  about 200 VND-priced products. No authentication/authorization, search,
  advanced filtering, pagination, or GSI is implemented in that slice.
