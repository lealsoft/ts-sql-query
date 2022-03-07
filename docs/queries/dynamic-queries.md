# Dynamic queries

## Introduction

ts-sql-query offers many commodity methods with name ended with `IfValue` to build dynamic queries; these methods allow to be ignored when the values specified by argument are `null` or `undefined` or an empty string (only when the `allowEmptyString` flag in the connection is not set to true, that is the default behaviour). When these methods are used in operations that return booleans value, ts-sql-query is smart enough to omit the operation when it is required, even when the operation is part of complex composition with `and`s and `or`s.

When you realize an insert or update, you can:

- set a column value conditionally using the method `setIfValue`
- replace a previously set value during the construction of the query using  the method `setIfSet` or the method `setIfSetIfValue`
- set a value if it was not previously set during the construction of the query using the method `setIfNotSet` or the method `setIfNotSetIfValue`
- ignore a previously set value using the method `ignoreIfSet`
- don't worry if you end with an update or delete with no where, you will get an error instead of update or delete all rows. You can allow explicitly having an update or delete with no where if you create it using the method `updateAllowingNoWhere` or `deleteAllowingNoWhereFrom` respectively

When you realize a select, you can:

- specify in your order by clause that the order must be case insensitive when the column type is string (ignored otherwise). To do it, add `insensitive` at the end of the ordering criteria/mode
- add a dynamic `order by` provided by the user without risk of SQL injection and without exposing the internal structure of the database. To build a dynamic `order by` use the method `orderByFromString` with the usual order by syntax (and with the possibility to use the insensitive extension), but using as column's name the name of the property in the resulting object
- You can apply `order by`, `limit` and `offset` optionally calling `orderByFromStringIfValue`, `limitIfValue` and `offsetIfValue`

Additionally, you can:

- create a dynamic boolean expression that you can use in a where (by example), calling the `dynamicBooleanExpresionUsing` method in the connection object.
- create a custom boolean condition from criteria object that you can use in a where (by example), calling the `dynamicConditionFor` method in the connection object. This functionality is useful when creating a complex search & filtering functionality in the user interface, where the user can apply a different combination of constraints.
- create a query where it is possible to pick the columns to be returned by the query.
- define an optional join in a select query. That join only must be included in the final query if the table involved in the join is used in the final query. For example, a column of the joined table was picked or used in a dynamic where.

## Easy dynamic queries

The methods ended with `IfValue` allows you to create dynamic queries in the easyest way; these methods works in the way when the values specified by argument are `null` or `undefined` or an empty string (only when the `allowEmptyString` flag in the connection is not set to true, that is the default behaviour) return a special neutral boolean that is ignored when it is used in `and`s, `or`s, `on`s or `where`s.

```ts
const firstNameContains = 'ohn';
const lastNameContains = null;
const birthdayIs = null;
const searchOrderBy = 'name insensitive, birthday asc nulls last';

const searchedCustomers = connection.selectFrom(tCustomer)
    .where(
                tCustomer.firstName.containsIfValue(firstNameContains)
            .or(tCustomer.lastName.containsIfValue(lastNameContains))
        ).and(
            tCustomer.birthday.equalsIfValue(birthdayIs)
        )
    .select({
        id: tCustomer.id,
        name: tCustomer.firstName.concat(' ').concat(tCustomer.lastName),
        birthday: tCustomer.birthday
    })
    .orderByFromString(searchOrderBy)
    .executeSelectMany();
```

The executed query is:
```sql
select id as id, first_name || $1 || last_name as name, birthday as birthday 
from customer 
where first_name like ('%' || $2 || '%') 
order by lower(name), birthday asc nulls last
```

The parameters are: `[ ' ', 'ohn' ]`

The result type is:
```tsx
const customerWithId: Promise<{
    id: number;
    name: string;
    birthday?: Date;
}[]>
```

## Complex dynamic boolean expressions

When the methods ended with `IfValue` are not enough to create dynamic complex boolean expressions, you can call the `dynamicBooleanExpresionUsing` method to create your complex boolean expressions. The `dynamicBooleanExpresionUsing` method is in the connection object. It allows you to create a dynamic expression with the initial value of the special neutral boolean. This method receives by argument the tables you expect to use while constructing the complex boolean expression.

The previous example can be written in the following way:

```ts
const firstNameContains = 'ohn';
const lastNameContains = null;
const birthdayIs = null;
const searchOrderBy = 'name insensitive, birthday asc nulls last';

let searchedCustomersWhere = connection.dynamicBooleanExpressionUsing(tCustomer)
if (firstNameContains) {
    searchedCustomersWhere = searchedCustomersWhere.and(tCustomer.firstName.contains(firstNameContains))
}
if (lastNameContains) {
    searchedCustomersWhere = searchedCustomersWhere.or(tCustomer.lastName.contains(lastNameContains))
}
if (birthdayIs) {
    searchedCustomersWhere = searchedCustomersWhere.and(tCustomer.birthday.equals(birthdayIs))
}

const searchedCustomers = connection.selectFrom(tCustomer)
    .where(searchedCustomersWhere)
    .select({
        id: tCustomer.id,
        name: tCustomer.firstName.concat(' ').concat(tCustomer.lastName),
        birthday: tCustomer.birthday
    })
    .orderByFromString(searchOrderBy)
    .executeSelectMany();
```

The executed query is:
```sql
select id as id, first_name || $1 || last_name as name, birthday as birthday 
from customer 
where first_name like ('%' || $2 || '%') 
order by lower(name), birthday asc nulls last
```

The parameters are: `[ ' ', 'ohn' ]`

The result type is:
```tsx
const searchedCustomers: Promise<{
    id: number;
    name: string;
    birthday?: Date;
}[]>
```

## Select using a dynamic filter

You can create a dynamic condition for use in a where (for example). In these dynamic conditions, the criteria are provided as an object. Another system, like the user interface, may fill the criteria object. The provided criteria object is translated to the corresponding SQL. To use this feature, you must call the method `dynamicConditionFor` from the connection; this method receives a map where the key is the name that the external system is going to use to refer to the field and the value is the corresponding value source to be used in the query. The `dynamicConditionFor` method returns an object that contains the method `withValues` that receives the criteria provided to the external system.

```ts
import { DynamicCondition } from "ts-sql-query/dynamicCondition"

type FilterType = DynamicCondition<{
    id: 'int',
    firstName: 'string',
    lastName: 'string',
    birthday: 'localDate',
    companyName: 'string'
}>

const filter: FilterType = {
    or: [
        { firstName: { startsWithInsensitive: 'John' } },
        { lastName: { startsWithInsensitiveIfValue: 'Smi', endsWith: 'th' } }
    ],
    companyName: {equals: 'ACME'}
}

const selectFields = {
    id: tCustomer.id,
    firstName: tCustomer.firstName,
    lastName: tCustomer.lastName,
    birthday: tCustomer.birthday,
    companyName: tCompany.name
}

const dynamicWhere = connection.dynamicConditionFor(selectFields).withValues(filter)

const customersWithDynamicCondition = connection.selectFrom(tCustomer)
    .innerJoin(tCompany).on(tCustomer.companyId.equals(tCompany.id))
    .where(dynamicWhere)
    .select(selectFields)
    .orderBy('firstName', 'insensitive')
    .orderBy('lastName', 'asc insensitive')
    .executeSelectMany()
```

The executed query is:
```sql
select customer.id as id, customer.first_name as firstName, customer.last_name as lastName, customer.birthday as birthday, company.name as companyName 
from customer inner join company on customer.company_id = company.id 
where 
    (   
        customer.first_name ilike ($1 || '%') 
        or (
                    customer.last_name ilike ($2 || '%') 
                and customer.last_name like ('%' || $3)
            )
    ) and company.name = $4 
order by lower(firstName), lower(lastName) asc
```

The parameters are: `[ 'John', 'Smi', 'th', 'ACME' ]`

The result type is:
```tsx
const customersWithCompanyName: Promise<{
    id: number;
    firstName: string;
    lastName: string;
    companyName: string;
    birthday?: Date;
}[]>
```

The utility type `DynamicCondition` and `TypeSafeDynamicCondition` (when the extended types are used with type-safe connections) from `ts-sql-query/dynamicCondition` allows you to create a type definition for the dynamic criteria.

See [Dynamic conditions](../supported-operations.md#dynamic-conditions) for more information.

## Select dynamically picking columns

You can create a select where the caller can conditionally pick the columns that want to be returned (like in GraphQL)

```ts
import { dynamicPick } from "ts-sql-query/dynamicCondition"

const availableFields = {
    id: tCustomer.id,
    firstName: tCustomer.firstName,
    lastName: tCustomer.lastName,
    birthday: tCustomer.birthday
}

const fieldsToPick = {
    firstName: true,
    lastName: true
}

// always include th id field in the result
const pickedFields = dynamicPick(availableFields, fieldsToPick, ['id'])

const customerWithIdPeaking = connection.selectFrom(tCustomer)
    .select(pickedFields)
    .executeSelectOne()
```

The executed query is:
```sql
select id as id, first_name as firstName, last_name as lastName
from customer
```

The parameters are: `[]`

The result type is:
```tsx
const customerWithIdPeaking: Promise<{
    id: number;
    birthday?: Date;
    firstName?: string;
    lastName?: string;
}>
```

The `fieldsToPick` object defines all the properties that will be included, and the value is a boolean that tells if that property must be included or not.

The utility function `dynamicPick` from `ts-sql-query/dynamicCondition` allows to you pick the fields from an object. This function returns a copy of the object received as the first argument with the properties with the same name and value `true` in the object received as the second argument. Optionally, you can include a list of the properties that always will be included as the third argument.

The type `DynamicPick<Type, Mandatory>` from `ts-sql-query/dynamicCondition` allows you to define a type expected for the object `fieldsToPick` where the first generic argument is the type to transform. Optionally you can provide a second generic argument with the name of the mandatories properties joined with `|`. Example: `DynamicPick<MyType, 'prop1' | 'prop2'>`.

## Optional joins

You can write selects where the columns are picked dynamically, but maybe a join is required depending on the picked columns. ts-sql-query offer you the possibility to indicate that join only must be included in the final query if the table involved in the join is used in the final query (by example, a column of that table was picked, or a column was used in a dynamic where). 

To indicate the join can be optionally included in the query, you must create the join using one of the following methods:

- `optionalJoin`
- `optionalInnerJoin`
- `optionalLeftJoin`
- `optionalLeftOuterJoin`

```ts
import { dynamicPick } from "ts-sql-query/dynamicCondition"

const availableFields = {
    id: tCustomer.id,
    firstName: tCustomer.firstName,
    lastName: tCustomer.lastName,
    birthday: tCustomer.birthday,
    companyId: tCompany.id,
    companyName: tCompany.name
}

const fieldsToPick = {
    firstName: true,
    lastName: true
}

// include allways id field as required
const pickedFields = dynamicPick(availableFields, fieldsToPick, ['id'])

const customerWithOptionalCompany = connection.selectFrom(tCustomer)
    .optionalInnerJoin(tCompany).on(tCompany.id.equals(tCustomer.companyId))
    .select(pickedFields)
    .where(tCustomer.id.equals(12))
    .executeSelectMany()
```

The executed query is:
```sql
select customer.id as id, customer.first_name as firstName, customer.last_name as lastName
from customer
where customer.id = $1
```

The parameters are: `[ 12 ]`

The result type is:
```tsx
const customerWithOptionalCompany: Promise<{
    id: number;
    birthday?: Date;
    firstName?: string;
    lastName?: string;
    companyId?: number;
    companyName?: string;
}[]>
```

But in case of a column provided by the join is required, like when `fieldsToPick` is:
```ts
const fieldsToPick = {
    firstName: true,
    lastName: true,
    companyName: true
}
```

The executed query is:
```sql
select customer.id as id, customer.first_name as firstName, customer.last_name as lastName, company.name as companyName
from customer inner join company on company.id = customer.company_id
where customer.id = $1
```

The parameters are: `[ 12 ]`

**Warning**: an omitted join can change the number of returned rows depending on your data structure. This behaviour doesn't happen when all rows of the initial table have one row in the joined table (or none if you use a left join), but not many rows.