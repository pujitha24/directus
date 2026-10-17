import { Field, Query } from '@directus/types';
import { createTestingPinia } from '@pinia/testing';
import { setActivePinia } from 'pinia';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { useFieldsStore } from '@/stores/fields';
import { useRelationsStore } from '@/stores/relations';
import { formatQuery } from '@/utils/query-to-gql-string';

const collectionName = 'users';
const primaryKeyField = 'id';
const key = 'query_abcde';

beforeEach(() => {
	setActivePinia(
		createTestingPinia({
			createSpy: () => (collection) => {
				return { collection, field: primaryKeyField };
			},
		}),
	);
});

describe('Empty query returns the primary key', () => {
	test.each([true, false])(`System collection: %o`, (isSystemCollection) => {
		const query: Query = {};

		const collection = isSystemCollection ? `directus_${collectionName}` : collectionName;
		const formatted = formatQuery({ collection, key, query });

		expect(formatted).toStrictEqual({
			__aliasFor: collectionName,
			__args: query,
			[primaryKeyField]: true,
		});
	});
});

describe('Defined fields are requested', () => {
	test.each([true, false])(`System collection: %o`, (isSystemCollection) => {
		const query: Query = { fields: ['aaa', 'bbb', 'ccc'] };

		const collection = isSystemCollection ? `directus_${collectionName}` : collectionName;
		const formatted = formatQuery({ collection, key, query });

		expect(formatted).toStrictEqual({
			__aliasFor: collectionName,
			__args: {},
			aaa: true,
			bbb: true,
			ccc: true,
		});
	});
});

describe('Wildcard fields are expanded', () => {
	test('Nested wildcard becomes the non-alias fields of the related collection', () => {
		setActivePinia(createTestingPinia({ createSpy: vi.fn }));

		const fieldsStore = useFieldsStore();
		const relationsStore = useRelationsStore();

		vi.mocked(relationsStore.getRelationsForField).mockReturnValue([
			{ collection: 'users_translations', field: 'users_id', related_collection: 'users', meta: null, schema: null },
		]);

		vi.mocked(fieldsStore.getFieldsForCollection).mockReturnValue([
			{ field: 'id', type: 'integer' },
			{ field: 'name', type: 'string' },
			{ field: 'other', type: 'alias' },
		] as Field[]);

		const formatted = formatQuery({ collection: collectionName, key, query: { fields: ['id', 'translations.*'] } });

		expect(formatted).toStrictEqual({
			__aliasFor: collectionName,
			__args: {},
			id: true,
			translations: { id: true, name: true },
		});
	});
});

describe('Aggregation query without group', () => {
	test.each([true, false])(`System collection: %o`, (isSystemCollection) => {
		const query: Query = { aggregate: { count: ['aaa'], sum: ['bbb', 'ccc'] } };

		const collection = isSystemCollection ? `directus_${collectionName}` : collectionName;
		const formatted = formatQuery({ collection, key, query });

		expect(formatted).toStrictEqual({
			__aliasFor: `${collectionName}_aggregated`,
			__args: {},
			count: {
				aaa: true,
			},
			sum: {
				bbb: true,
				ccc: true,
			},
		});
	});
});

describe('Aggregation query with group', () => {
	test.each([true, false])(`System collection: %o`, (isSystemCollection) => {
		const query: Query = { aggregate: { count: ['aaa'], sum: ['bbb', 'ccc'] }, group: ['ddd', 'eee'] };

		const collection = isSystemCollection ? `directus_${collectionName}` : collectionName;
		const formatted = formatQuery({ collection, key, query });

		expect(formatted).toStrictEqual({
			__aliasFor: `${collectionName}_aggregated`,
			__args: {
				groupBy: ['ddd', 'eee'],
			},
			count: {
				aaa: true,
			},
			sum: {
				bbb: true,
				ccc: true,
			},
			group: true,
		});
	});
});

describe('Filter query without functions', () => {
	test.each([true, false])(`System collection: %o`, (isSystemCollection) => {
		const query: Query = { filter: { _and: [{ aaa: { _eq: '111' } }, { bbb: { ccc: { _eq: '222' } } }] } };

		const collection = isSystemCollection ? `directus_${collectionName}` : collectionName;
		const formatted = formatQuery({ collection, key, query });

		expect(formatted).toStrictEqual({
			__aliasFor: collectionName,
			__args: {
				filter: { _and: [{ aaa: { _eq: '111' } }, { bbb: { ccc: { _eq: '222' } } }] },
			},
			[primaryKeyField]: true,
		});
	});
});

describe('Filter query with functions', () => {
	test.each([true, false])(`System collection: %o`, (isSystemCollection) => {
		const query: Query = {
			filter: { _and: [{ 'count(aaa)': { _eq: '111' } }, { bbb: { 'sum(ccc)': { _eq: '222' } } }] },
		};

		const collection = isSystemCollection ? `directus_${collectionName}` : collectionName;
		const formatted = formatQuery({ collection, key, query });

		expect(formatted).toStrictEqual({
			__aliasFor: collectionName,
			__args: {
				filter: { _and: [{ aaa_func: { count: { _eq: '111' } } }, { bbb: { ccc_func: { sum: { _eq: '222' } } } }] },
			},
			[primaryKeyField]: true,
		});
	});
});
