import { afterEach, describe, expect, it } from 'vitest';
import { faker } from '@faker-js/faker';
import { z } from 'zod';
import {
  CardholderSchema,
  CardSchema,
  CategorySchema,
  ErrorResponseSchema,
  type SpendingNature,
} from '@bills/shared';
import { DEFAULT_CATEGORIES } from '@bills/domain';
import { createDatabase, type DatabaseConnection } from '@bills/db';
import { buildServer } from '../src/app.js';

const CardholdersListResponseSchema = z.object({
  cardholders: z.array(CardholderSchema),
});

const CardsListResponseSchema = z.object({
  cards: z.array(CardSchema),
});

const CategoriesListResponseSchema = z.object({
  categories: z.array(CategorySchema),
});

function createValidCardPayload(cardholderId: string): {
  cardholderId: string;
  lastFourDigits: string;
  provider: 'ISRACARD' | 'AMEX';
  nickname: string;
} {
  return {
    cardholderId,
    lastFourDigits: faker.string.numeric(4),
    provider: faker.helpers.arrayElement(['ISRACARD', 'AMEX'] as const),
    nickname: faker.finance.accountName(),
  };
}

function createValidCategoryPayload(
  overrides: Partial<{
    name: string;
    spendingNature: SpendingNature;
    color: string;
    budgetTargetIls: number | null;
    sortOrder: number;
  }> = {},
): {
  name: string;
  spendingNature: SpendingNature;
  color: string;
  budgetTargetIls?: number | null;
  sortOrder?: number;
} {
  return {
    name: faker.commerce.department(),
    spendingNature: faker.helpers.arrayElement([
      'FIXED',
      'VARIABLE',
      'DISCRETIONARY',
    ] as const),
    color: faker.color.rgb(),
    budgetTargetIls: faker.number.int({ min: 500, max: 5000 }),
    ...overrides,
  };
}

describe('Household Setup API Integration (Cardholders, Cards & Categories)', () => {
  let dbConnection: DatabaseConnection | null = null;

  afterEach(() => {
    if (dbConnection) {
      dbConnection.close();
      dbConnection = null;
    }
  });

  it('automatically seeds two default Cardholders on initialization', async () => {
    // Arrange
    dbConnection = createDatabase(':memory:');
    const app = await buildServer({
      db: dbConnection.db,
      sqlite: dbConnection.sqlite,
      logger: false,
    });

    // Act
    const response = await app.inject({ method: 'GET', url: '/api/cardholders' });

    // Assert
    expect(response.statusCode).toBe(200);
    const { cardholders } = CardholdersListResponseSchema.parse(response.json());
    expect(cardholders.map((ch) => ch.name)).toEqual(['אני', 'אשתי']);
  });

  it('automatically seeds the 14 Hebrew Categories across FIXED, VARIABLE, and DISCRETIONARY on initialization', async () => {
    // Arrange
    dbConnection = createDatabase(':memory:');
    const app = await buildServer({
      db: dbConnection.db,
      sqlite: dbConnection.sqlite,
      logger: false,
    });

    // Act
    const response = await app.inject({ method: 'GET', url: '/api/categories' });

    // Assert
    expect(response.statusCode).toBe(200);
    const { categories } = CategoriesListResponseSchema.parse(response.json());
    expect(categories).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(
      categories
        .filter((cat) => cat.spendingNature === 'FIXED')
        .map((c) => c.name),
    ).toEqual([
      'חשבונות ודיור',
      'תקשורת ומנויים',
      'ביטוחים ובריאות',
      'חינוך וחוגים',
    ]);
    expect(
      categories
        .filter((cat) => cat.spendingNature === 'VARIABLE')
        .map((c) => c.name),
    ).toEqual([
      'קניות וסופרמרקט',
      'פארם וטיפוח',
      'תחבורה ודלק',
      'רכב ותחזוקה',
      'שונות לבית',
    ]);
    expect(
      categories
        .filter((cat) => cat.spendingNature === 'DISCRETIONARY')
        .map((c) => c.name),
    ).toEqual([
      'פינוקים ומסעדות',
      'שופינג וביגוד',
      'בילויים ופנאי',
      'חופשות וטיולים',
      'מתנות ואירועים',
    ]);
  });

  it('creates, renames, and deletes a Cardholder via /api/cardholders', async () => {
    // Arrange
    dbConnection = createDatabase(':memory:');
    const app = await buildServer({
      db: dbConnection.db,
      sqlite: dbConnection.sqlite,
      logger: false,
    });
    const createdRes = await app.inject({
      method: 'POST',
      url: '/api/cardholders',
      payload: { name: faker.person.firstName() },
    });
    const created = CardholderSchema.parse(createdRes.json());
    const updatedName = faker.person.firstName();

    // Act
    const updateRes = await app.inject({
      method: 'PATCH',
      url: `/api/cardholders/${created.id}`,
      payload: { name: updatedName },
    });

    // Assert
    expect(createdRes.statusCode).toBe(201);
    expect(updateRes.statusCode).toBe(200);
    expect(CardholderSchema.parse(updateRes.json()).name).toBe(updatedName);
  });

  it.each([
    {
      scenario: 'empty Cardholder name',
      cardholderId: 'cardholder-primary',
      payload: { name: '   ' },
      expectedStatus: 400,
    },
    {
      scenario: 'unknown Cardholder ID',
      cardholderId: 'non-existent-cardholder',
      payload: { name: faker.person.firstName() },
      expectedStatus: 404,
    },
  ])(
    'rejects invalid Cardholder update when $scenario',
    async ({ cardholderId, payload, expectedStatus }) => {
      // Arrange
      dbConnection = createDatabase(':memory:');
      const app = await buildServer({
        db: dbConnection.db,
        sqlite: dbConnection.sqlite,
        logger: false,
      });

      // Act
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/cardholders/${cardholderId}`,
        payload,
      });

      // Assert
      expect(response.statusCode).toBe(expectedStatus);
      expect(ErrorResponseSchema.safeParse(response.json()).success).toBe(true);
    },
  );

  it('creates a new Card linked to a Cardholder via POST /api/cards', async () => {
    // Arrange
    dbConnection = createDatabase(':memory:');
    const app = await buildServer({
      db: dbConnection.db,
      sqlite: dbConnection.sqlite,
      logger: false,
    });
    const cardholdersRes = await app.inject({
      method: 'GET',
      url: '/api/cardholders',
    });
    const primary = CardholdersListResponseSchema.parse(cardholdersRes.json())
      .cardholders[0]!;
    const cardPayload = createValidCardPayload(primary.id);

    // Act
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/cards',
      payload: cardPayload,
    });

    // Assert
    expect(createRes.statusCode).toBe(201);
    const createdCard = CardSchema.parse(createRes.json());
    expect(createdCard.lastFourDigits).toBe(cardPayload.lastFourDigits);
    expect(createdCard.cardholderId).toBe(primary.id);
  });

  it('updates an existing Card via PATCH /api/cards/:id', async () => {
    // Arrange
    dbConnection = createDatabase(':memory:');
    const app = await buildServer({
      db: dbConnection.db,
      sqlite: dbConnection.sqlite,
      logger: false,
    });
    const cardholdersRes = await app.inject({
      method: 'GET',
      url: '/api/cardholders',
    });
    const [primary, spouse] = CardholdersListResponseSchema.parse(
      cardholdersRes.json(),
    ).cardholders;
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/cards',
      payload: createValidCardPayload(primary!.id),
    });
    const createdCard = CardSchema.parse(createRes.json());
    const newNickname = faker.finance.accountName();

    // Act
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/cards/${createdCard.id}`,
      payload: {
        nickname: newNickname,
        cardholderId: spouse!.id,
        provider: 'AMEX',
      },
    });

    // Assert
    expect(patchRes.statusCode).toBe(200);
    const patchedCard = CardSchema.parse(patchRes.json());
    expect(patchedCard.nickname).toBe(newNickname);
    expect(patchedCard.cardholderId).toBe(spouse!.id);
    expect(patchedCard.provider).toBe('AMEX');
  });

  it('deletes an existing Card via DELETE /api/cards/:id', async () => {
    // Arrange
    dbConnection = createDatabase(':memory:');
    const app = await buildServer({
      db: dbConnection.db,
      sqlite: dbConnection.sqlite,
      logger: false,
    });
    const cardholdersRes = await app.inject({
      method: 'GET',
      url: '/api/cardholders',
    });
    const primary = CardholdersListResponseSchema.parse(cardholdersRes.json())
      .cardholders[0]!;
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/cards',
      payload: createValidCardPayload(primary.id),
    });
    const createdCard = CardSchema.parse(createRes.json());

    // Act
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/cards/${createdCard.id}`,
    });

    // Assert
    expect(deleteRes.statusCode).toBe(204);
    const finalListRes = await app.inject({ method: 'GET', url: '/api/cards' });
    const { cards } = CardsListResponseSchema.parse(finalListRes.json());
    expect(cards).toHaveLength(0);
  });

  it.each([
    {
      scenario: 'non-4-digit lastFourDigits',
      override: { lastFourDigits: faker.string.numeric(3) },
      expectedStatus: 400,
    },
    {
      scenario: 'non-numeric lastFourDigits',
      override: { lastFourDigits: faker.string.alpha(4) },
      expectedStatus: 400,
    },
    {
      scenario: 'empty nickname',
      override: { nickname: '   ' },
      expectedStatus: 400,
    },
    {
      scenario: 'non-existent cardholderId',
      override: { cardholderId: faker.string.uuid() },
      expectedStatus: 404,
    },
  ])(
    'rejects invalid Card creation when $scenario',
    async ({ override, expectedStatus }) => {
      // Arrange
      dbConnection = createDatabase(':memory:');
      const app = await buildServer({
        db: dbConnection.db,
        sqlite: dbConnection.sqlite,
        logger: false,
      });
      const cardholdersRes = await app.inject({
        method: 'GET',
        url: '/api/cardholders',
      });
      const primary = CardholdersListResponseSchema.parse(cardholdersRes.json())
        .cardholders[0]!;
      const payload = { ...createValidCardPayload(primary.id), ...override };

      // Act
      const response = await app.inject({
        method: 'POST',
        url: '/api/cards',
        payload,
      });

      // Assert
      expect(response.statusCode).toBe(expectedStatus);
      expect(ErrorResponseSchema.safeParse(response.json()).success).toBe(true);
    },
  );

  it('creates a new Category with a monthly Budget Target via POST /api/categories', async () => {
    // Arrange
    dbConnection = createDatabase(':memory:');
    const app = await buildServer({
      db: dbConnection.db,
      sqlite: dbConnection.sqlite,
      logger: false,
    });
    const newCategoryPayload = createValidCategoryPayload();

    // Act
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/categories',
      payload: newCategoryPayload,
    });

    // Assert
    expect(createRes.statusCode).toBe(201);
    const createdCategory = CategorySchema.parse(createRes.json());
    expect(createdCategory.name).toBe(newCategoryPayload.name);
    expect(createdCategory.budgetTargetIls).toBe(
      newCategoryPayload.budgetTargetIls,
    );
  });

  it('updates a Category Spending Nature, sortOrder, and clears Budget Target via PATCH /api/categories/:id', async () => {
    // Arrange
    dbConnection = createDatabase(':memory:');
    const app = await buildServer({
      db: dbConnection.db,
      sqlite: dbConnection.sqlite,
      logger: false,
    });
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/categories',
      payload: createValidCategoryPayload({ spendingNature: 'DISCRETIONARY' }),
    });
    const createdCategory = CategorySchema.parse(createRes.json());
    const updatedSortOrder = faker.number.int({ min: 20, max: 99 });

    // Act
    const updateRes = await app.inject({
      method: 'PATCH',
      url: `/api/categories/${createdCategory.id}`,
      payload: {
        spendingNature: 'FIXED',
        budgetTargetIls: null,
        sortOrder: updatedSortOrder,
      },
    });

    // Assert
    expect(updateRes.statusCode).toBe(200);
    const updatedCategory = CategorySchema.parse(updateRes.json());
    expect(updatedCategory.spendingNature).toBe('FIXED');
    expect(updatedCategory.budgetTargetIls).toBeNull();
    expect(updatedCategory.sortOrder).toBe(updatedSortOrder);
  });

  it('deletes a Category via DELETE /api/categories/:id and removes it from the list', async () => {
    // Arrange
    dbConnection = createDatabase(':memory:');
    const app = await buildServer({
      db: dbConnection.db,
      sqlite: dbConnection.sqlite,
      logger: false,
    });
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/categories',
      payload: createValidCategoryPayload(),
    });
    const createdCategory = CategorySchema.parse(createRes.json());

    // Act
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/categories/${createdCategory.id}`,
    });

    // Assert
    expect(deleteRes.statusCode).toBe(204);
    const listRes = await app.inject({ method: 'GET', url: '/api/categories' });
    const { categories } = CategoriesListResponseSchema.parse(listRes.json());
    expect(categories.some((cat) => cat.id === createdCategory.id)).toBe(false);
  });

  it.each([
    {
      scenario: 'empty Category name',
      method: 'POST' as const,
      url: '/api/categories',
      payload: createValidCategoryPayload({ name: '   ' }),
      expectedStatus: 400,
    },
    {
      scenario: 'non-positive budgetTargetIls',
      method: 'POST' as const,
      url: '/api/categories',
      payload: createValidCategoryPayload({ budgetTargetIls: -100 }),
      expectedStatus: 400,
    },
    {
      scenario: 'unknown Category ID on update',
      method: 'PATCH' as const,
      url: `/api/categories/${faker.string.uuid()}`,
      payload: { name: faker.commerce.department() },
      expectedStatus: 404,
    },
  ])(
    'rejects invalid Category operation when $scenario',
    async ({ method, url, payload, expectedStatus }) => {
      // Arrange
      dbConnection = createDatabase(':memory:');
      const app = await buildServer({
        db: dbConnection.db,
        sqlite: dbConnection.sqlite,
        logger: false,
      });

      // Act
      const response = await app.inject({ method, url, payload });

      // Assert
      expect(response.statusCode).toBe(expectedStatus);
      expect(ErrorResponseSchema.safeParse(response.json()).success).toBe(true);
    },
  );
});
