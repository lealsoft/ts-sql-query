# General purpose query runners

**Important**: A ts-sql-query connection object and the queries runners objects received as constructor's arguments represent a dedicated connection; consequently, don't share connections between requests when you are handling HTTP requests; create one connection object per request with its own query runners. Even when the ts-sql-query connection object uses a query runner that receives a connection pool, the ts-sql-query connection sill represents a dedicated connection to the database extracted automatically from the pool and must not be shared.

## ConsoleLogNoopQueryRunner

A fake connections that write all the queries to the standard output using `console.log` and returns an empty result.

**Supported databases**: mariaDB, mySql, oracle, postgreSql, sqlite, sqlServer

```ts
import { ConsoleLogNoopQueryRunner } from "ts-sql-query/queryRunners/ConsoleLogNoopQueryRunner";

async function main() {
    const connection = new DBConection(new ConsoleLogNoopQueryRunner());
    // Do your queries here
}
```

**Note**: `ConsoleLogNoopQueryRunner` supports synchronous query execution. See [Synchronous query runners](../advanced-usage.md#synchronous-query-runners) for more information.

## ConsoleLogQueryRunner

A query runner that write all the queries to the standard output using `console.log` and delegate the execution of the queries to the query runner received as argument in the constructor.

**Supported databases**: mariaDB, mySql, oracle, postgreSql, sqlite, sqlServer

```ts
import { ConsoleLogQueryRunner } from "ts-sql-query/queryRunners/ConsoleLogQueryRunner";

async function main() {
    const connection = new DBConection(new ConsoleLogQueryRunner(otherQueryRunner));
    // Do your queries here
}
```

## InterceptorQueryRunner

A query runner that intercept all the queries and delegate the execution of the queries to the query runner received as second argument in the constructor.

**Supported databases**: mariaDB, mySql, oracle, postgreSql, sqlite, sqlServer

```ts
import { InterceptorQueryRunner, QueryType } from "ts-sql-query/queryRunners/InterceptorQueryRunner";

interface DurationPlayload {
    startTime: number
}
class DurationLogginQueryRunner extends InterceptorQueryRunner<DurationPlayload> {
    onQuery(queryType: QueryType, query: string, params: any[]): DurationPlayload {
        console.log('onQuery', queryType, query, params)
        return { startTime: Date.now() }
    }
    onQueryResult(queryType: QueryType, query: string, params: any[], result: any, playload: DurationPlayload): void {
        const duration = Date.now() - playload.startTime
        console.log('onQueryResult', queryType, query, params, result, duration)
    }
    onQueryError(queryType: QueryType, query: string, params: any[], error: any, playload: DurationPlayload): void {
        const duration = Date.now() - playload.startTime
        console.log('onQueryError', queryType, query, params, error, duration)
    }
}

async function main() {
    const connection = new DBConection(new DurationLogginQueryRunner(otherQueryRunner));
    // Do your queries here
}
```

The `InterceptorQueryRunner` is an abstract class where you must implement the following functions:

- **`onQuery`**: Executed before the query. This function returns the playload data that will be recived by the next functions.
- **`onQueryResult`**: Executed after the successful execution of the query. Receives as last argument the playload data created by the `onQuery` method.
- **`onQueryError`**: Executed after the query in case of error. Receives as last argument the playload data created by the `onQuery` method.

This class receives as the first generic type the playload type created when the query execution starts and receives when the query execution ends

All these functions receive as argument:

- **`type: QueryType`**: type of the query to be executed. The `QueryType` is defined as:

```ts
type QueryType = 'selectOneRow' | 'selectManyRows' | 'selectOneColumnOneRow' | 'selectOneColumnManyRows' | 
'insert' | 'insertReturningLastInsertedId' | 'insertReturningMultipleLastInsertedId' | 
'insertReturningOneRow' | 'insertReturningManyRows' | 'insertReturningOneColumnOneRow' | 'insertReturningOneColumnManyRows' |
'update' | 'updateReturningOneRow' | 'updateReturningManyRows' | 'updateReturningOneColumnOneRow' | 'updateReturningOneColumnManyRows' | 
'delete' | 'deleteReturningOneRow' | 'deleteReturningManyRows' | 'deleteReturningOneColumnOneRow' | 'deleteReturningOneColumnManyRows' |
'executeProcedure' | 'executeFunction' | 
'beginTransaction' | 'commit' | 'rollback' |
'executeDatabaseSchemaModification'
```

- **`query: string`**: query required to be executed, empty in the case of `beginTransaction`, `commit` or `rollback`
- **`params: any[]`**: parameters received by the query.
- **`result: any`**: (only in `onQueryResult`) result of the execution of the query.
- **`error: any`**: (only in `onQueryError`) error that happens executiong the query.
- **`playload: PLAYLOAD_TYPE`**:  (only in `onQueryResult` or `onQueryError`) playload data created by the `onQuery` function.

## LoggingQueryRunner

A query runner that intercept all the queries allowing you to log it and delegate the execution of the queries to the query runner received as second argument in the constructor.

**Supported databases**: mariaDB, mySql, oracle, postgreSql, sqlite, sqlServer

```ts
import { LoggingQueryRunner } from "ts-sql-query/queryRunners/LoggingQueryRunner";

async function main() {
    const connection = new DBConection(new LoggingQueryRunner({
        onQuery(queryType, query, params) {
            console.log('onQuery', queryType, query, params)
        },
        onQueryResult(queryType, query, params, result) {
            console.log('onQueryResult', queryType, query, params, result)
        },
        onQueryError(queryType, query, params, error) {
            console.log('onQueryError', queryType, query, params, error)
        }
    }, otherQueryRunner));
    // Do your queries here
}
```

The `LoggingQueryRunner` receives an object as first argument of the constructor that can define the following functions:

- **`onQuery`**: Executed before the query.
- **`onQueryResult`**: Executed after the successful execution of the query.
- **`onQueryError`**: Executed after the query in case of error.

All these functions receive as argument:

- **`type: QueryType`**: type of the query to be executed. The `QueryType` is defined as:

```ts
type QueryType = 'selectOneRow' | 'selectManyRows' | 'selectOneColumnOneRow' | 'selectOneColumnManyRows' | 
'insert' | 'insertReturningLastInsertedId' | 'insertReturningMultipleLastInsertedId' | 
'insertReturningOneRow' | 'insertReturningManyRows' | 'insertReturningOneColumnOneRow' | 'insertReturningOneColumnManyRows' |
'update' | 'updateReturningOneRow' | 'updateReturningManyRows' | 'updateReturningOneColumnOneRow' | 'updateReturningOneColumnManyRows' | 
'delete' | 'deleteReturningOneRow' | 'deleteReturningManyRows' | 'deleteReturningOneColumnOneRow' | 'deleteReturningOneColumnManyRows' |
'executeProcedure' | 'executeFunction' | 
'beginTransaction' | 'commit' | 'rollback' |
'executeDatabaseSchemaModification'
```

- **`query: string`**: query required to be executed, empty in the case of `beginTransaction`, `commit` or `rollback`
- **`params: any[]`**: parameters received by the query.
- **`result: any`**: (only in `onQueryResult`) result of the execution of the query.
- **`error: any`**: (only in `onQueryError`) error that happens executiong the query.

**Note**: `onQuery`, `onQueryResult` and `onQueryError` are optionals; you can defined only the method that you needs.

## MockQueryRunner

Mock connection that allows you inspect the queries and return the desired value as result of the query execution.

**Supported databases**: mariaDB, mySql, oracle, postgreSql, sqlite, sqlServer

```ts
import { MockQueryRunner } from "ts-sql-query/queryRunners/MockQueryRunner";

async function main() {
    const connection = new DBConection(new MockQueryRunner(
        (type, query, params, index) => {
            // verify your queries here
        }
    ));

    // Do your queries here
}
```

The `MockQueryRunner` receives a function as argument to the constructor, this function returns the result of the query execution and receive as argument:

- **`type: QueryType`**: type of the query to be executed. The `QueryType` is defined as:

```ts
type QueryType = 'selectOneRow' | 'selectManyRows' | 'selectOneColumnOneRow' | 'selectOneColumnManyRows' | 
'insert' | 'insertReturningLastInsertedId' | 'insertReturningMultipleLastInsertedId' | 
'insertReturningOneRow' | 'insertReturningManyRows' | 'insertReturningOneColumnOneRow' | 'insertReturningOneColumnManyRows' |
'update' | 'updateReturningOneRow' | 'updateReturningManyRows' | 'updateReturningOneColumnOneRow' | 'updateReturningOneColumnManyRows' | 
'delete' | 'deleteReturningOneRow' | 'deleteReturningManyRows' | 'deleteReturningOneColumnOneRow' | 'deleteReturningOneColumnManyRows' | 
'executeProcedure' | 'executeFunction' | 
'beginTransaction' | 'commit' | 'rollback' |
'executeDatabaseSchemaModification' | 'isTransactionActive'
```

- **`query: string`**: query required to be executed
- **`params: any[]`**: parameters received by the query
- **`index: number`**: this is a counter of queries executed by the connection; that means, when the first query is executed the value is 0, when the second query is executed the value is 1, etc.

**Note**: `MockQueryRunner` supports synchronous query execution. See [Synchronous query runners](../advanced-usage.md#synchronous-query-runners) for more information.

**Example of usage**

```ts
test('my test', async () => {
    const connection = new DBConection(new MockQueryRunner((type, query, params, index) => {
        switch (index) {
        case 0:
            expect(type).toEqual('insertReturningLastInsertedId');
            expect(query).toEqual('insert into company (name) values ($1) returning id');
            expect(params).toEqual([ 'ACME' ]);

            // Return the result of the query execution, in this case the inserted id
            return 12;
        case 1:
            expect(type).toEqual('selectOneRow');
            expect(query).toEqual('select id as id, name as name from company where id = $1');
            expect(params).toEqual([ 12 ]);

            // Return the result of the query execution, in this case the requested row
            return { id: 12, name: 'ACME' };
        }
        throw new Error('Unexpected query in the test case');
    }));

    const testCompanyId = await connection
        .insertInto(tCompany)
        .values({ name: 'ACME' })
        .returningLastInsertedId()
        .executeInsert();

    expect(testCompanyId).toEqual(12);

    let testCompany = await connection
        .selectFrom(tCompany)
        .where(tCompany.id.equals(testCompanyId))
        .select({
            id: tCompany.id,
            name: tCompany.name
        })
        .executeSelectOne();

    expect(testCompany).toEqual({ id: 12, name: 'ACME' });
});
```

## NoopQueryRunner

A fake connections that returns an empty result.

**Supported databases**: mariaDB, mySql, oracle, postgreSql, sqlite, sqlServer

```ts
import { NoopQueryRunner } from "ts-sql-query/queryRunners/NoopQueryRunner";

async function main() {
    const connection = new DBConection(new NoopQueryRunner());
    // Do your queries here
}
```

**Note**: `NoopQueryRunner` supports synchronous query execution. See [Synchronous query runners](../advanced-usage.md#synchronous-query-runners) for more information.