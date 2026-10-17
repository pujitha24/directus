import { isSystemCollection } from '@directus/system-data';
import { Filter, Query } from '@directus/types';
import { parseJSON, toArray } from '@directus/utils';
import { jsonToGraphQLQuery } from 'json-to-graphql-query';
import { isEmpty, isUndefined, omitBy, pick, set, transform } from 'lodash-es';
import { extractFieldFromFunction } from './extract-field-from-function';
import { getRelatedCollection, type RelatedCollectionData } from './get-related-collection';
import { useFieldsStore } from '@/stores/fields';

type QueryInfo = { collection: string; key: string; query: Query };

export function queryToGqlString(queries: QueryInfo | QueryInfo[]): string | null {
	if (!queries || isEmpty(queries)) return null;

	const queryJSON: Record<string, any> = {
		query: {},
	};

	for (const query of toArray(queries)) {
		queryJSON.query[query.key] = formatQuery(query);
	}

	return jsonToGraphQLQuery(queryJSON);
}

export function formatQuery({ collection, query }: QueryInfo): Record<string, any> {
	const queryKeysInArguments: (keyof Query)[] = ['limit', 'sort', 'filter', 'offset', 'page', 'search'];

	const alias = isSystemCollection(collection) ? collection.substring(9) : collection;

	const formattedQuery: Record<string, any> = {
		__args: omitBy(pick(query, ...queryKeysInArguments), isUndefined),
		__aliasFor: alias,
	};

	const fields = query.fields ?? [useFieldsStore().getPrimaryKeyFieldForCollection(collection)!.field];

	if (query?.aggregate && !isEmpty(query.aggregate)) {
		formattedQuery.__aliasFor = alias + '_aggregated';

		for (const [aggregateFunc, fields] of Object.entries(query.aggregate)) {
			if (!formattedQuery[aggregateFunc]) {
				formattedQuery[aggregateFunc] = {};
			}

			fields.forEach((field) => {
				formattedQuery[aggregateFunc][field] = true;
			});
		}

		if (query.group) {
			formattedQuery.group = true;
			formattedQuery.__args.groupBy = query.group;
		}
	} else {
		for (const field of expandWildcards(collection, fields)) {
			set(formattedQuery, field, true);
		}
	}

	if (query.deep) {
		// TBD @TODO
	}

	if (query.filter) {
		try {
			const filterValue = typeof query.filter === 'object' ? query.filter : parseJSON(String(query.filter));
			formattedQuery.__args.filter = replaceFuncs(filterValue);
		} catch {
			// Keep current value there
		}
	}

	return formattedQuery;
}

/**
 * GraphQL has no wildcard selection, so expand any `*` into the collection's non-alias fields
 */
function expandWildcards(collection: string, fields: string[]): string[] {
	const fieldsStore = useFieldsStore();

	return fields.flatMap((field) => {
		const parts = field.split('.');
		if (parts.pop() !== '*') return field;

		let current: string | undefined = collection;

		for (const part of parts) {
			const related: RelatedCollectionData | null = current ? getRelatedCollection(current, part) : null;
			current = related ? (related.junctionCollection ?? related.relatedCollection) : undefined;
		}

		if (!current) return [];

		return fieldsStore
			.getFieldsForCollection(current)
			.filter((f) => f.type !== 'alias')
			.map((f) => [...parts, f.field].join('.'));
	});
}

/**
 * Replace functions from Directus-Filter format to GraphQL format
 */
function replaceFuncs(filter?: Filter | null): null | undefined | Filter {
	if (!filter) return filter;

	return replaceFuncDeep(filter);

	function replaceFuncDeep(filter: Record<string, any>) {
		return transform(filter, (result: Record<string, any>, value, key) => {
			if (typeof key === 'string' && key.includes('(') && key.includes(')')) {
				const { fn, field } = extractFieldFromFunction(key);

				if (fn) {
					result[`${field}_func`] = {
						[fn]: value,
					};
				} else {
					result[key] = value;
				}
			} else {
				result[key] = value?.constructor === Object || value?.constructor === Array ? replaceFuncDeep(value) : value;
			}
		});
	}
}
