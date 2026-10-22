import type { MerchantRow } from '@bills/db';
import type {
  CardDto,
  CardholderDto,
  CategoryDto,
  MerchantDto,
} from '@bills/shared';

export interface EntityLookupSources {
  cardholders: readonly CardholderDto[];
  cards: readonly CardDto[];
  categories: readonly CategoryDto[];
  merchants?: readonly (MerchantRow | MerchantDto)[];
}

export interface EntityLookupMaps {
  cardholderNameMap: Map<string, string>;
  cardMap: Map<string, CardDto>;
  categoryNameById: Map<string, string>;
  categoryById: Map<string, CategoryDto>;
  merchantMap: Map<string, MerchantRow | MerchantDto>;
}

export function buildIdMap<T extends { id: string }>(
  items: readonly T[],
): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

export function buildNameMap<T extends { id: string; name: string }>(
  items: readonly T[],
): Map<string, string> {
  return new Map(items.map((item) => [item.id, item.name]));
}

export function buildEntityLookupMaps(
  sources: EntityLookupSources,
): EntityLookupMaps {
  return {
    cardholderNameMap: buildNameMap(sources.cardholders),
    cardMap: buildIdMap(sources.cards),
    categoryNameById: buildNameMap(sources.categories),
    categoryById: buildIdMap(sources.categories),
    merchantMap: buildIdMap(sources.merchants ?? []),
  };
}
