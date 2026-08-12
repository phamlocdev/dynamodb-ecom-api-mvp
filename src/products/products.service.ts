import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { DynamoDbService } from '../dynamodb/dynamodb.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductStatus } from './product-status.enum';
import { Product } from './product.types';
import { PaginationQueryDto } from '../pagination/pagination-query.dto';
import { PaginatedResponse } from '../pagination/pagination.types';
import {
  resolvePaginationState,
  toPaginatedResponse,
} from '../pagination/pagination.util';

@Injectable()
export class ProductsService {
  private readonly tableName: string;

  constructor(
    private readonly dynamoDbService: DynamoDbService,
    configService: ConfigService,
  ) {
    this.tableName = configService.get<string>('PRODUCTS_TABLE') ?? 'products';
  }

  async create(dto: CreateProductDto): Promise<Product> {
    const timestamp = new Date().toISOString();
    const product: Product = {
      productId: randomUUID(),
      name: dto.name,
      description: dto.description,
      categoryId: dto.categoryId,
      price: dto.price,
      currency: 'VND',
      imageUrl: dto.imageUrl,
      status: dto.status ?? ProductStatus.ACTIVE,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    try {
      await this.dynamoDbService.documentClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: product,
          ConditionExpression: 'attribute_not_exists(#productId)',
          ExpressionAttributeNames: { '#productId': 'productId' },
        }),
      );
      return product;
    } catch (error) {
      if (isConditionalCheckFailure(error)) {
        throw new ConflictException('A product with this ID already exists.');
      }
      throw error;
    }
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResponse<Product>> {
    const pagination = resolvePaginationState('products', query);
    const response = await this.dynamoDbService.documentClient.send(
      new ScanCommand({
        TableName: this.tableName,
        Limit: pagination.limit,
        ExclusiveStartKey: pagination.startKey ?? undefined,
      }),
    );

    return toPaginatedResponse(
      'products',
      pagination,
      (response.Items ?? []) as Product[],
      response.LastEvaluatedKey,
    );
  }

  async findOne(productId: string): Promise<Product> {
    const response = await this.dynamoDbService.documentClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { productId },
      }),
    );
    if (!response.Item) {
      throw new NotFoundException(`Product ${productId} was not found.`);
    }
    return response.Item as Product;
  }

  async update(productId: string, dto: UpdateProductDto): Promise<Product> {
    const mutableFields = Object.entries(dto).filter(([, value]) => value !== undefined);
    if (mutableFields.length === 0) {
      throw new BadRequestException('Provide at least one product field to update.');
    }

    const timestamp = new Date().toISOString();
    const expressionAttributeNames: Record<string, string> = {
      '#productId': 'productId',
      '#updatedAt': 'updatedAt',
    };
    const expressionAttributeValues: Record<string, unknown> = {
      ':updatedAt': timestamp,
    };
    const updateParts = mutableFields.map(([field, value]) => {
      const nameKey = `#${field}`;
      const valueKey = `:${field}`;
      expressionAttributeNames[nameKey] = field;
      expressionAttributeValues[valueKey] = value;
      return `${nameKey} = ${valueKey}`;
    });
    updateParts.push('#updatedAt = :updatedAt');

    try {
      const response = await this.dynamoDbService.documentClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { productId },
          UpdateExpression: `SET ${updateParts.join(', ')}`,
          ConditionExpression: 'attribute_exists(#productId)',
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
          ReturnValues: 'ALL_NEW',
        }),
      );
      return response.Attributes as Product;
    } catch (error) {
      if (isConditionalCheckFailure(error)) {
        throw new NotFoundException(`Product ${productId} was not found.`);
      }
      throw error;
    }
  }

  async remove(productId: string): Promise<void> {
    try {
      await this.dynamoDbService.documentClient.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { productId },
          ConditionExpression: 'attribute_exists(#productId)',
          ExpressionAttributeNames: { '#productId': 'productId' },
        }),
      );
    } catch (error) {
      if (isConditionalCheckFailure(error)) {
        throw new NotFoundException(`Product ${productId} was not found.`);
      }
      throw error;
    }
  }
}

function isConditionalCheckFailure(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'ConditionalCheckFailedException'
  );
}
