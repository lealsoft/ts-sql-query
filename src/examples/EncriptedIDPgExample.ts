/*
 * npm install pg
 * docker run --name ts-sql-query-postgres -p 5432:5432 -e POSTGRES_PASSWORD=mysecretpassword -d postgres
 */

import { Pool } from 'pg'
import { PgPoolQueryRunner } from "../queryRunners/PgPoolQueryRunner";
import { PostgreSqlConnection } from "../connections/PostgreSqlConnection";
import { Table } from "../Table";
import { assertEquals } from "./assertEquals";
import { ConsoleLogQueryRunner } from "../queryRunners/ConsoleLogQueryRunner";
import { IDEncrypter } from '../extras/IDEncrypter';

class DBConection extends PostgreSqlConnection<'DBConnection'> {
    increment(i: number) {
        return this.executeFunction('increment', [this.const(i, 'int')], 'int', 'required')
    }
    appendToAllCompaniesName(aditional: string) {
        return this.executeProcedure('append_to_all_companies_name', [this.const(aditional, 'string')])
    }
    customerSeq = this.sequence<string>('customer_seq', 'customComparable', 'encryptedID')

    // PasswordEncrypter requires two strings of 16 chars of [A-Za-z0-9] working as passwords for the encrypt process
    private encrypter = new IDEncrypter('3zTvzr3p67VC61jm', '60iP0h6vJoEaJo8c')
    protected transformValueFromDB(value: unknown, type: string): unknown {
        if (type === 'encryptedID') {
            const id = super.transformValueFromDB(value, 'bigint')
            if (typeof id === 'bigint') {
                return this.encrypter.encrypt(id)
            } else {
                // return the value as is, it could be null
                return id
            }
        }
        return super.transformValueFromDB(value, type)
    }
    protected transformValueToDB(value: unknown, type: string): unknown {
        if (type === 'encryptedID') {
            if (value === null || value === undefined) {
                // In case of null or undefined send null to the database
                return null
            } else if (typeof value === 'string') {
                const id = this.encrypter.decrypt(value)
                return super.transformValueToDB(id, 'bigint')
            } else {
                throw new Error('Invalid id: ' + value)
            }
        }
        return super.transformValueToDB(value, type)
    }
}

const tCompany = new class TCompany extends Table<DBConection, 'TCompany'> {
    id = this.autogeneratedPrimaryKey<string>('id', 'customComparable', 'encryptedID');
    name = this.column('name', 'string');
    parentId = this.optionalColumn<string>('parent_id', 'customComparable', 'encryptedID');
    // This column allows access to the id without encrypt it
    rawID = this.computedColumn('id', 'int');
    constructor() {
        super('company'); // table name in the database
    }
}()

const tCustomer = new class TCustomer extends Table<DBConection, 'TCustomer'> {
    id = this.autogeneratedPrimaryKeyBySequence<string>('id', 'customer_seq', 'customComparable', 'encryptedID');
    firstName = this.column('first_name', 'string');
    lastName = this.column('last_name', 'string');
    birthday = this.optionalColumn('birthday', 'localDate');
    companyId = this.column<string>('company_id', 'customComparable', 'encryptedID');
    constructor() {
        super('customer'); // table name in the database
    }
}()

const tRecord = new class TRecord extends Table<DBConection, 'TRecord'> {
    id = this.primaryKey('id', 'uuid');
    title = this.column('title', 'string');
    constructor() {
        super('record'); // table name in the database
    }
}()


const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'postgres',
    password: 'mysecretpassword',
    port: 5432,
})

async function main() {
    const connection = new DBConection(new ConsoleLogQueryRunner(new PgPoolQueryRunner(pool)))
    await connection.beginTransaction()

    try {
        await connection.queryRunner.executeDatabaseSchemaModification(`
            drop table if exists customer;
            drop table if exists company;
            drop sequence if exists customer_seq;
            drop function if exists increment;
            drop procedure if exists append_to_all_companies_name;

            create table company (
                id serial primary key,
                name varchar(100) not null,
                parent_id integer null references company(id)
            );

            create table customer (
                id integer primary key,
                first_name varchar(100) not null,
                last_name varchar(100) not null,
                birthday date,
                company_id integer not null references company(id)
            );

            create sequence customer_seq;

            create function increment(i integer) returns integer AS $$
                begin
                    return i + 1;
                end;
            $$ language plpgsql;

            create procedure append_to_all_companies_name(aditional varchar) as $$
                update company set name = name || aditional;
            $$ language sql;
        `)

        await connection.queryRunner.executeDatabaseSchemaModification(`drop table if exists record`)
        await connection.queryRunner.executeDatabaseSchemaModification(`
            create table record (
                id uuid primary key,
                title varchar(100) not null
            )
        `)

        let i = await connection
            .insertInto(tCompany)
            .values({ name: 'ACME' })
            .returningLastInsertedId()
            .executeInsert()
        assertEquals(i, 'uftSdCUhUTBQ0111')

        let n = await connection
            .insertInto(tCompany)
            .values({ name: 'FOO' })
            .executeInsert()
        assertEquals(n, 1)

        let ii = await connection
            .insertInto(tCustomer)
            .values([
                { firstName: 'John', lastName: 'Smith', companyId: 'uftSdCUhUTBQ0111' },
                { firstName: 'Other', lastName: 'Person', companyId: 'uftSdCUhUTBQ0111' },
                { firstName: 'Jane', lastName: 'Doe', companyId: 'uftSdCUhUTBQ0111' }
            ])
            .returningLastInsertedId()
            .executeInsert()
        assertEquals(ii, ['uftSdCUhUTBQ0111', 'dmY1mZ8zdxsw0210', 'RYG2E7kLCEQh030b'])

        i = await connection
            .selectFromNoTable()
            .selectOneColumn(connection.customerSeq.currentValue())
            .executeSelectOne()
        assertEquals(i, 'RYG2E7kLCEQh030b')

        let company = await connection
            .selectFrom(tCompany)
            .where(tCompany.id.equals('uftSdCUhUTBQ0111'))
            .select({
                id: tCompany.id,
                name: tCompany.name
            })
            .executeSelectOne()
        assertEquals(company, { id: 'uftSdCUhUTBQ0111', name: 'ACME' })

        let companies = await connection
            .selectFrom(tCompany)
            .select({
                id: tCompany.id,
                name: tCompany.name,
                rawID: tCompany.rawID
            })
            .orderBy('id')
            .executeSelectMany()
        assertEquals(companies, [{ id: 'uftSdCUhUTBQ0111', name: 'ACME', rawID: 1 }, { id: 'dmY1mZ8zdxsw0210', name: 'FOO', rawID: 2 }])

        let name = await connection
            .selectFrom(tCompany)
            .where(tCompany.id.equals('uftSdCUhUTBQ0111'))
            .selectOneColumn(tCompany.name)
            .executeSelectOne()
        assertEquals(name, 'ACME')

        let names = await connection
            .selectFrom(tCompany)
            .selectOneColumn(tCompany.name)
            .orderBy('result')
            .executeSelectMany()
        assertEquals(names, ['ACME', 'FOO'])

        n = await connection
            .insertInto(tCompany)
            .from(
                connection
                .selectFrom(tCompany)
                .select({
                    name: tCompany.name.concat(' 2')
                })
            )
            .executeInsert()
        assertEquals(n, 2)

        names = await connection
            .selectFrom(tCompany)
            .selectOneColumn(tCompany.name)
            .orderBy('result')
            .executeSelectMany()
        assertEquals(names, ['ACME', 'ACME 2', 'FOO', 'FOO 2'])

        const fooComanyNameLength = connection
            .selectFrom(tCompany)
            .selectOneColumn(tCompany.name.length())
            .where(tCompany.id.equals('dmY1mZ8zdxsw0210'))
            .forUseAsInlineQueryValue()

        companies = await connection
            .selectFrom(tCompany)
            .select({
                id: tCompany.id,
                name: tCompany.name,
                rawID: tCompany.rawID
            })
            .where(tCompany.name.length().greaterThan(fooComanyNameLength))
            .orderBy('id')
            .executeSelectMany()
        assertEquals(companies, [{ id: 'uftSdCUhUTBQ0111', name: 'ACME', rawID: 1 },{ id: 'RYG2E7kLCEQh030b', name: 'ACME 2', rawID: 3 }, { id: 'YAuzxMU1mdYn0408', name: 'FOO 2', rawID: 4}])

        n = await connection
            .update(tCompany)
            .set({
                name: tCompany.name.concat(tCompany.name)
            })
            .where(tCompany.id.equals('dmY1mZ8zdxsw0210'))
            .executeUpdate()
        assertEquals(n, 1)

        name = await connection
            .selectFrom(tCompany)
            .where(tCompany.id.equals('dmY1mZ8zdxsw0210'))
            .selectOneColumn(tCompany.name)
            .executeSelectOne()
        assertEquals(name, 'FOOFOO')

        n = await connection
            .deleteFrom(tCompany)
            .where(tCompany.id.equals('dmY1mZ8zdxsw0210'))
            .executeDelete()
        assertEquals(n, 1)

        let maybe = await connection
            .selectFrom(tCompany)
            .where(tCompany.id.equals('dmY1mZ8zdxsw0210'))
            .selectOneColumn(tCompany.name)
            .executeSelectNoneOrOne()
        assertEquals(maybe, null)

        let page = await connection
            .selectFrom(tCustomer)
            .select({
                id: tCustomer.id,
                name: tCustomer.firstName.concat(' ').concat(tCustomer.lastName)
            })
            .orderBy('id')
            .limit(2)
            .executeSelectPage()
        assertEquals(page, {
            count: 3,
            data: [
                { id: 'uftSdCUhUTBQ0111', name: 'John Smith' },
                { id: 'dmY1mZ8zdxsw0210', name: 'Other Person' }
            ]
        })

        const customerCountPerCompanyWith = connection.selectFrom(tCompany)
            .innerJoin(tCustomer).on(tCustomer.companyId.equals(tCompany.id))
            .select({
                companyId: tCompany.id,
                companyName: tCompany.name,
                endsWithME: tCompany.name.endsWithInsensitive('me'),
                customerCount: connection.count(tCustomer.id)
            }).groupBy('companyId', 'companyName', 'endsWithME')
            .forUseInQueryAs('customerCountPerCompany')

        const customerCountPerAcmeCompanies = await connection.selectFrom(customerCountPerCompanyWith)
            .where(customerCountPerCompanyWith.companyName.containsInsensitive('ACME'))
            .select({
                acmeCompanyId: customerCountPerCompanyWith.companyId,
                acmeCompanyName: customerCountPerCompanyWith.companyName,
                acmeEndsWithME: customerCountPerCompanyWith.endsWithME,
                acmeCustomerCount: customerCountPerCompanyWith.customerCount
            })
            .executeSelectMany()
        assertEquals(customerCountPerAcmeCompanies, [
            { acmeCompanyId: 'uftSdCUhUTBQ0111', acmeCompanyName: 'ACME', acmeEndsWithME: true, acmeCustomerCount: 3 }
        ])

        const aggregatedCustomersOfAcme = connection.subSelectUsing(tCompany).from(tCustomer)
            .where(tCustomer.companyId.equals(tCompany.id))
            .selectOneColumn(connection.aggregateAsArray({
                id: tCustomer.id,
                firstName: tCustomer.firstName,
                lastName: tCustomer.lastName
            }))
            .forUseAsInlineQueryValue()

        const acmeCompanyWithCustomers = await connection.selectFrom(tCompany)
            .where(tCompany.id.equals('uftSdCUhUTBQ0111'))
            .select({
                id: tCompany.id,
                name: tCompany.name,
                customers: aggregatedCustomersOfAcme
            })
            .executeSelectOne()
        acmeCompanyWithCustomers.customers!.sort((a, b) => {
            if (a.id > b.id) {
                return 1;
              }
              if (a.id < b.id) {
                return -1;
              }
              return 0;
        })
        assertEquals(acmeCompanyWithCustomers, {
            id: 'uftSdCUhUTBQ0111',
            name: 'ACME',
            customers: [
                { id: 'RYG2E7kLCEQh030b', firstName: 'Jane', lastName: 'Doe' },
                { id: 'dmY1mZ8zdxsw0210', firstName: 'Other', lastName: 'Person' },
                { id: 'uftSdCUhUTBQ0111', firstName: 'John', lastName: 'Smith' }
            ]
        })

        const tCustomerLeftJoin = tCustomer.forUseInLeftJoin()
        const acmeCompanyWithCustomers2 = await connection.selectFrom(tCompany).leftJoin(tCustomerLeftJoin).on(tCustomerLeftJoin.companyId.equals(tCompany.id))
            .where(tCompany.id.equals('uftSdCUhUTBQ0111'))
            .select({
                id: tCompany.id,
                name: tCompany.name,
                customers: connection.aggregateAsArray({
                    id: tCustomerLeftJoin.id,
                    firstName: tCustomerLeftJoin.firstName,
                    lastName: tCustomerLeftJoin.lastName
                }).useEmptyArrayForNoValue()
            })
            .groupBy('id')
            .executeSelectOne()
        acmeCompanyWithCustomers2.customers.sort((a, b) => {
            if (a.id > b.id) {
                return 1;
                }
                if (a.id < b.id) {
                return -1;
                }
                return 0;
        })
        assertEquals(acmeCompanyWithCustomers2, {
            id: 'uftSdCUhUTBQ0111',
            name: 'ACME',
            customers: [
                { id: 'RYG2E7kLCEQh030b', firstName: 'Jane', lastName: 'Doe' },
                { id: 'dmY1mZ8zdxsw0210', firstName: 'Other', lastName: 'Person' },
                { id: 'uftSdCUhUTBQ0111', firstName: 'John', lastName: 'Smith' }
            ]
        })

        const aggregatedCustomersOfAcme3 = connection.subSelectUsing(tCompany).from(tCustomer)
            .where(tCustomer.companyId.equals(tCompany.id))
            .selectOneColumn(connection.aggregateAsArrayOfOneColumn(tCustomer.firstName.concat(' ').concat(tCustomer.lastName)))
            .forUseAsInlineQueryValue()

        const acmeCompanyWithCustomers3 = await connection.selectFrom(tCompany)
            .where(tCompany.id.equals('uftSdCUhUTBQ0111'))
            .select({
                id: tCompany.id,
                name: tCompany.name,
                customers: aggregatedCustomersOfAcme3.useEmptyArrayForNoValue()
            })
            .executeSelectOne()
        acmeCompanyWithCustomers3.customers.sort()
        assertEquals(acmeCompanyWithCustomers3, {
            id: 'uftSdCUhUTBQ0111',
            name: 'ACME',
            customers: [
                'Jane Doe',
                'John Smith',
                'Other Person'
            ]
        })

        const aggregatedCustomersOfAcme4 = connection.subSelectUsing(tCompany).from(tCustomer)
            .where(tCustomer.companyId.equals(tCompany.id))
            .select({
                id: tCustomer.id,
                firstName: tCustomer.firstName,
                lastName: tCustomer.lastName
            })
            .forUseAsInlineAggregatedArrayValue()

        const acmeCompanyWithCustomers4 = await connection.selectFrom(tCompany)
            .where(tCompany.id.equals('uftSdCUhUTBQ0111'))
            .select({
                id: tCompany.id,
                name: tCompany.name,
                customers: aggregatedCustomersOfAcme4
            })
            .executeSelectOne()
        acmeCompanyWithCustomers4.customers!.sort((a, b) => {
            if (a.id > b.id) {
                return 1;
                }
                if (a.id < b.id) {
                return -1;
                }
                return 0;
        })
        assertEquals(acmeCompanyWithCustomers4, {
            id: 'uftSdCUhUTBQ0111',
            name: 'ACME',
            customers: [
                { id: 'RYG2E7kLCEQh030b', firstName: 'Jane', lastName: 'Doe' },
                { id: 'dmY1mZ8zdxsw0210', firstName: 'Other', lastName: 'Person' },
                { id: 'uftSdCUhUTBQ0111', firstName: 'John', lastName: 'Smith' }
            ]
        })

        const aggregatedCustomersOfAcme5 = connection.subSelectUsing(tCompany).from(tCustomer)
            .where(tCustomer.companyId.equals(tCompany.id))
            .select({
                id: tCustomer.id,
                firstName: tCustomer.firstName,
                lastName: tCustomer.lastName
            })
            .orderBy('id')
            .forUseAsInlineAggregatedArrayValue()

        const acmeCompanyWithCustomers5 = await connection.selectFrom(tCompany)
            .where(tCompany.id.equals('uftSdCUhUTBQ0111'))
            .select({
                id: tCompany.id,
                name: tCompany.name,
                customers: aggregatedCustomersOfAcme5
            })
            .executeSelectOne()
        assertEquals(acmeCompanyWithCustomers5, {
            id: 'uftSdCUhUTBQ0111',
            name: 'ACME',
            customers: [
                { id: 'uftSdCUhUTBQ0111', firstName: 'John', lastName: 'Smith' },
                { id: 'dmY1mZ8zdxsw0210', firstName: 'Other', lastName: 'Person' },
                { id: 'RYG2E7kLCEQh030b', firstName: 'Jane', lastName: 'Doe' }
            ]
        })

        const aggregatedCustomersOfAcme6 = connection.subSelectUsing(tCompany).from(tCustomer)
            .where(tCustomer.companyId.equals(tCompany.id))
            .selectOneColumn(tCustomer.firstName.concat(' ').concat(tCustomer.lastName))
            .forUseAsInlineAggregatedArrayValue()

        const acmeCompanyWithCustomers6 = await connection.selectFrom(tCompany)
            .where(tCompany.id.equals('uftSdCUhUTBQ0111'))
            .select({
                id: tCompany.id,
                name: tCompany.name,
                customers: aggregatedCustomersOfAcme6.useEmptyArrayForNoValue()
            })
            .executeSelectOne()
        acmeCompanyWithCustomers6.customers.sort()
        assertEquals(acmeCompanyWithCustomers6, {
            id: 'uftSdCUhUTBQ0111',
            name: 'ACME',
            customers: [
                'Jane Doe',
                'John Smith',
                'Other Person'
            ]
        })

        const aggregatedCustomersOfAcme7 = connection.subSelectUsing(tCompany).from(tCustomer)
            .where(tCustomer.companyId.equals(tCompany.id))
            .selectOneColumn(tCustomer.firstName.concat(' ').concat(tCustomer.lastName))
            .orderBy('result')
            .forUseAsInlineAggregatedArrayValue()

        const acmeCompanyWithCustomers7 = await connection.selectFrom(tCompany)
            .where(tCompany.id.equals('uftSdCUhUTBQ0111'))
            .select({
                id: tCompany.id,
                name: tCompany.name,
                customers: aggregatedCustomersOfAcme7.useEmptyArrayForNoValue()
            })
            .executeSelectOne()
        assertEquals(acmeCompanyWithCustomers7, {
            id: 'uftSdCUhUTBQ0111',
            name: 'ACME',
            customers: [
                'Jane Doe',
                'John Smith',
                'Other Person'
            ]
        })

        const aggregatedCustomersOfAcme8 = connection.subSelectUsing(tCompany).from(tCustomer)
            .where(tCustomer.companyId.equals(tCompany.id))
            .select({
                id: tCustomer.id,
                firstName: tCustomer.firstName,
                lastName: tCustomer.lastName
            }).union(
                connection.subSelectUsing(tCompany).from(tCustomer)
                .where(tCustomer.companyId.equals(tCompany.id))
                .select({
                    id: tCustomer.id,
                    firstName: tCustomer.firstName,
                    lastName: tCustomer.lastName
                })
            )
            .forUseAsInlineAggregatedArrayValue()

        const acmeCompanyWithCustomers8 = await connection.selectFrom(tCompany)
            .where(tCompany.id.equals('uftSdCUhUTBQ0111'))
            .select({
                id: tCompany.id,
                name: tCompany.name,
                customers: aggregatedCustomersOfAcme8
            })
            .executeSelectOne()
        acmeCompanyWithCustomers8.customers!.sort((a, b) => {
            if (a.id > b.id) {
                return 1;
                }
                if (a.id < b.id) {
                return -1;
                }
                return 0;
        })
        assertEquals(acmeCompanyWithCustomers8, {
            id: 'uftSdCUhUTBQ0111',
            name: 'ACME',
            customers: [
                { id: 'RYG2E7kLCEQh030b', firstName: 'Jane', lastName: 'Doe' },
                { id: 'dmY1mZ8zdxsw0210', firstName: 'Other', lastName: 'Person' },
                { id: 'uftSdCUhUTBQ0111', firstName: 'John', lastName: 'Smith' }
            ]
        })

        const aggregatedCustomersOfAcme9 = connection.subSelectUsing(tCompany).from(tCustomer)
            .where(tCustomer.companyId.equals(tCompany.id))
            .select({
                id: tCustomer.id,
                firstName: tCustomer.firstName,
                lastName: tCustomer.lastName
            }).union(
                connection.subSelectUsing(tCompany).from(tCustomer)
                .where(tCustomer.companyId.equals(tCompany.id))
                .select({
                    id: tCustomer.id,
                    firstName: tCustomer.firstName,
                    lastName: tCustomer.lastName
                })
            ).orderBy('id')
            .forUseAsInlineAggregatedArrayValue()

        const acmeCompanyWithCustomers9 = await connection.selectFrom(tCompany)
            .where(tCompany.id.equals('uftSdCUhUTBQ0111'))
            .select({
                id: tCompany.id,
                name: tCompany.name,
                customers: aggregatedCustomersOfAcme9
            })
            .executeSelectOne()
        assertEquals(acmeCompanyWithCustomers9, {
            id: 'uftSdCUhUTBQ0111',
            name: 'ACME',
            customers: [
                { id: 'uftSdCUhUTBQ0111', firstName: 'John', lastName: 'Smith' },
                { id: 'dmY1mZ8zdxsw0210', firstName: 'Other', lastName: 'Person' },
                { id: 'RYG2E7kLCEQh030b', firstName: 'Jane', lastName: 'Doe' }
            ]
        })

        const aggregatedCustomersOfAcme10 = connection.subSelectUsing(tCompany).from(tCustomer)
            .where(tCustomer.companyId.equals(tCompany.id))
            .selectOneColumn(tCustomer.firstName.concat(' ').concat(tCustomer.lastName))
            .union(
                connection.subSelectUsing(tCompany).from(tCustomer)
                .where(tCustomer.companyId.equals(tCompany.id))
                .selectOneColumn(tCustomer.firstName.concat(' ').concat(tCustomer.lastName))
            )
            .forUseAsInlineAggregatedArrayValue()

        const acmeCompanyWithCustomers10 = await connection.selectFrom(tCompany)
            .where(tCompany.id.equals('uftSdCUhUTBQ0111'))
            .select({
                id: tCompany.id,
                name: tCompany.name,
                customers: aggregatedCustomersOfAcme10.useEmptyArrayForNoValue()
            })
            .executeSelectOne()
        acmeCompanyWithCustomers10.customers.sort()
        assertEquals(acmeCompanyWithCustomers10, {
            id: 'uftSdCUhUTBQ0111',
            name: 'ACME',
            customers: [
                'Jane Doe',
                'John Smith',
                'Other Person'
            ]
        })

        const aggregatedCustomersOfAcme11 = connection.subSelectUsing(tCompany).from(tCustomer)
            .where(tCustomer.companyId.equals(tCompany.id))
            .selectOneColumn(tCustomer.firstName.concat(' ').concat(tCustomer.lastName))
            .union(
                connection.subSelectUsing(tCompany).from(tCustomer)
                .where(tCustomer.companyId.equals(tCompany.id))
                .selectOneColumn(tCustomer.firstName.concat(' ').concat(tCustomer.lastName))
            ).orderBy('result')
            .forUseAsInlineAggregatedArrayValue()

        const acmeCompanyWithCustomers11 = await connection.selectFrom(tCompany)
            .where(tCompany.id.equals('uftSdCUhUTBQ0111'))
            .select({
                id: tCompany.id,
                name: tCompany.name,
                customers: aggregatedCustomersOfAcme11.useEmptyArrayForNoValue()
            })
            .executeSelectOne()
        assertEquals(acmeCompanyWithCustomers11, {
            id: 'uftSdCUhUTBQ0111',
            name: 'ACME',
            customers: [
                'Jane Doe',
                'John Smith',
                'Other Person'
            ]
        })

        n = await connection.increment(10)
        assertEquals(n, 11)

        await connection.appendToAllCompaniesName(' Cia.')

        name = await connection
            .selectFrom(tCompany)
            .where(tCompany.id.equals('uftSdCUhUTBQ0111'))
            .selectOneColumn(tCompany.name)
            .executeSelectOne()
        assertEquals(name, 'ACME Cia.')

        ii = await connection
            .insertInto(tCompany)
            .from(
                connection
                .selectFrom(tCompany)
                .select({
                    name: tCompany.name.concat(' 3')
                })
            )
            .returningLastInsertedId()
            .executeInsert()
        assertEquals(ii, ['BQjHWTD6_ulK0507', 'J_BFtuk1cz1D0609', 'EHT8AO2zDvi0070d'])

        const updatedSmithFirstName = await connection.update(tCustomer)
            .set({
                firstName: 'Ron'
            })
            .where(tCustomer.id.equals('uftSdCUhUTBQ0111'))
            .returningOneColumn(tCustomer.firstName)
            .executeUpdateOne()
        assertEquals(updatedSmithFirstName, 'Ron')

        const oldCustomerValues = tCustomer.oldValues()
        const updatedLastNames = await connection.update(tCustomer)
            .set({
                lastName: 'Customer'
            })
            .where(tCustomer.id.equals('dmY1mZ8zdxsw0210'))
            .returning({
                oldLastName: oldCustomerValues.lastName,
                newLastName: tCustomer.lastName
            })
            .executeUpdateOne()
        assertEquals(updatedLastNames, {oldLastName: 'Person', newLastName: 'Customer'})

        const deletedCustomers = await connection.deleteFrom(tCustomer)
            .where(tCustomer.id.greaterOrEquals('dmY1mZ8zdxsw0210'))
            .returning({
                id: tCustomer.id,
                firstName: tCustomer.firstName,
                lastName: tCustomer.lastName
            })
            .executeDeleteMany()
        deletedCustomers.sort((a, b) => {
            if (a.id > b.id) {
                return 1;
                }
                if (a.id < b.id) {
                return -1;
                }
                return 0;
        })
        assertEquals(deletedCustomers, [{ id:'RYG2E7kLCEQh030b', firstName: 'Jane', lastName: 'Doe' }, { id: 'dmY1mZ8zdxsw0210', firstName: 'Other', lastName: 'Customer' }])

        let insertOneCustomers = await connection
            .insertInto(tCustomer)
            .values({ firstName: 'Other', lastName: 'Person', companyId: 'uftSdCUhUTBQ0111' })
            .returning({
                id: tCustomer.id,
                firstName: tCustomer.firstName,
                lastName: tCustomer.lastName
            })
            .executeInsertOne()
        assertEquals(insertOneCustomers, { id: 'YAuzxMU1mdYn0408', firstName: 'Other', lastName: 'Person' })

        const insertMultipleCustomers = await connection
            .insertInto(tCustomer)
            .values([
                { firstName: 'Other 2', lastName: 'Person 2', companyId: 'uftSdCUhUTBQ0111' },
                { firstName: 'Other 3', lastName: 'Person 3', companyId: 'uftSdCUhUTBQ0111' }
            ])
            .returning({
                id: tCustomer.id,
                firstName: tCustomer.firstName,
                lastName: tCustomer.lastName
            })
            .executeInsertMany()
        assertEquals(insertMultipleCustomers, [ { id: 'BQjHWTD6_ulK0507', firstName: 'Other 2', lastName: 'Person 2' }, { id: 'J_BFtuk1cz1D0609', firstName: 'Other 3', lastName: 'Person 3' }])

        insertOneCustomers = await connection
            .insertInto(tCustomer)
            .from(
                connection
                .selectFrom(tCustomer)
                .select({
                    firstName: tCustomer.firstName.concat(' 2'),
                    lastName: tCustomer.lastName.concat(' 2'),
                    companyId: tCustomer.companyId
                })
                .where(tCustomer.id.equals('uftSdCUhUTBQ0111'))
            )
            .returning({
                id: tCustomer.id,
                firstName: tCustomer.firstName,
                lastName: tCustomer.lastName
            })
            .executeInsertOne()
        assertEquals(insertOneCustomers, { id: 'EHT8AO2zDvi0070d', firstName: 'Ron 2', lastName: 'Smith 2' })

        n = await connection.update(tCustomer)
            .from(tCompany)
            .set({
                lastName: tCustomer.lastName.concat(' - ').concat(tCompany.name)
            })
            .where(tCustomer.companyId.equals(tCompany.id))
            .and(tCustomer.id.equals('uftSdCUhUTBQ0111'))
            .executeUpdate()
        assertEquals(n, 1)

        n = await connection.deleteFrom(tCustomer)
            .using(tCompany)
            .where(tCustomer.companyId.equals(tCompany.id))
            .and(tCustomer.id.equals('uftSdCUhUTBQ0111'))
            .executeDelete()
        assertEquals(n, 1)

        const smithLastNameUpdate = await connection.update(tCustomer)
            .from(tCompany)
            .set({
                lastName: 'Smith'
            })
            .where(tCustomer.companyId.equals(tCompany.id))
            .and(tCompany.name.equals('ACME Cia.'))
            .and(tCustomer.firstName.equals('Ron 2'))
            .returning({
                oldLastName: oldCustomerValues.lastName,
                newLastName: tCustomer.lastName
            })
            .executeUpdateOne()
        assertEquals(smithLastNameUpdate, {oldLastName: 'Smith 2', newLastName: 'Smith'})

        const smithLastNameUpdate2 = await connection.update(tCustomer)
            .from(tCompany)
            .set({
                lastName: tCustomer.lastName.concat(' - ').concat(tCompany.name)
            })
            .where(tCustomer.companyId.equals(tCompany.id))
            .and(tCompany.name.equals('ACME Cia.'))
            .and(tCustomer.firstName.equals('Ron 2'))
            .returning({
                oldLastName: oldCustomerValues.lastName,
                newLastName: tCustomer.lastName
            })
            .executeUpdateOne()
        assertEquals(smithLastNameUpdate2, {oldLastName: 'Smith', newLastName: 'Smith - ACME Cia.'})

        const smithLastNameUpdate3 = await connection.update(tCustomer)
            .from(tCompany)
            .set({
                lastName: 'Smith'
            })
            .where(tCustomer.companyId.equals(tCompany.id))
            .and(tCompany.name.equals('ACME Cia.'))
            .and(tCustomer.firstName.equals('Ron 2'))
            .returning({
                oldLastName: oldCustomerValues.lastName,
                newLastName: tCustomer.lastName.concat('/').concat(tCompany.name)
            })
            .executeUpdateOne()
        assertEquals(smithLastNameUpdate3, {oldLastName: 'Smith - ACME Cia.', newLastName: 'Smith/ACME Cia.'})

        const companiesIds = await connection.insertInto(tCompany)
            .values([
                {name: 'Top Company'},
                {name: 'Mic Company', parentId: 'pd3iGJLINuEC0811'},
                {name: 'Low Company', parentId: 'Q3qCqYo7hGUP0909'}
            ])
            .returningLastInsertedId()
            .executeInsert()
        assertEquals(companiesIds, ['pd3iGJLINuEC0811', 'Q3qCqYo7hGUP0909', 'uftSdCUhUTtQ010d'])

        const parentCompany = tCompany.as('parentCompany')

        const parentCompanies = connection.subSelectUsing(tCompany)
            .from(parentCompany)
            .select({
                id: parentCompany.id,
                name: parentCompany.name,
                parentId: parentCompany.parentId
            })
            .where(parentCompany.id.equals(tCompany.parentId))
            .recursiveUnionAllOn((child) => {
                return child.parentId.equals(parentCompany.id)
            })
            .forUseAsInlineAggregatedArrayValue()

        const lowCompany = await connection.selectFrom(tCompany)
            .select({
                id: tCompany.id,
                name: tCompany.name,
                parentId: tCompany.parentId,
                parents: parentCompanies
            })
            .where(tCompany.id.equals('uftSdCUhUTtQ010d'))
            .executeSelectOne()
        assertEquals(lowCompany, { id: 'uftSdCUhUTtQ010d', name: 'Low Company', parentId: 'Q3qCqYo7hGUP0909', parents: [{ id: 'Q3qCqYo7hGUP0909', name: 'Mic Company', parentId: 'pd3iGJLINuEC0811' }, { id: 'pd3iGJLINuEC0811', name: 'Top Company' }] })

        const parentCompanies2 = connection.selectFrom(parentCompany)
            .select({
                id: parentCompany.id,
                name: parentCompany.name,
                parentId: parentCompany.parentId
            })
            .where(parentCompany.id.equals('Q3qCqYo7hGUP0909'))
            .recursiveUnionAllOn((child) => {
                return child.parentId.equals(parentCompany.id)
            })
            .forUseAsInlineAggregatedArrayValue()

        const lowCompany2 = await connection.selectFrom(tCompany)
            .select({
                id: tCompany.id,
                name: tCompany.name,
                parentId: tCompany.parentId,
                parents: parentCompanies2
            })
            .where(tCompany.id.equals('uftSdCUhUTtQ010d'))
            .executeSelectOne()
        assertEquals(lowCompany2, { id: 'uftSdCUhUTtQ010d', name: 'Low Company', parentId: 'Q3qCqYo7hGUP0909', parents: [{ id: 'Q3qCqYo7hGUP0909', name: 'Mic Company', parentId: 'pd3iGJLINuEC0811' }, { id: 'pd3iGJLINuEC0811', name: 'Top Company' }] })

        const lowCompany3 = await connection.selectFrom(tCompany)
            .select({
                id: tCompany.id,
                name: tCompany.name,
                parentId: tCompany.parentId
            })
            .where(tCompany.id.equals('uftSdCUhUTtQ010d'))
            .composeDeletingInternalProperty({
                externalProperty: 'parentId',
                internalProperty: 'startId',
                propertyName: 'parents'
            }).withMany((ids) => {
                return connection.selectFrom(parentCompany)
                    .select({
                        id: parentCompany.id,
                        name: parentCompany.name,
                        parentId: parentCompany.parentId,
                        startId: parentCompany.id
                    })
                    .where(parentCompany.id.in(ids))
                    .recursiveUnionAll((child) => {
                        return connection.selectFrom(parentCompany)
                            .join(child).on(child.parentId.equals(parentCompany.id))
                            .select({
                                id: parentCompany.id,
                                name: parentCompany.name,
                                parentId: parentCompany.parentId,
                                startId: child.startId
                            })
                    })
                    .executeSelectMany()
            })
            .executeSelectOne()
        assertEquals(lowCompany3, { id: 'uftSdCUhUTtQ010d', name: 'Low Company', parentId: 'Q3qCqYo7hGUP0909', parents: [{ id: 'Q3qCqYo7hGUP0909', name: 'Mic Company', parentId: 'pd3iGJLINuEC0811' }, { id: 'pd3iGJLINuEC0811', name: 'Top Company' }] })

        n = await connection.insertInto(tRecord).values({
                id: '89bf68fc-7002-11ec-90d6-0242ac120003',
                title: 'My voice memo'
            }).executeInsert()
        assertEquals(n, 1)

        const record = await connection.selectFrom(tRecord)
            .select({
                id: tRecord.id,
                title: tRecord.title
            })
            .where(tRecord.id.asString().contains('7002'))
            .executeSelectOne()
        assertEquals(record, { id: '89bf68fc-7002-11ec-90d6-0242ac120003', title: 'My voice memo' })

        await connection.commit()
    } catch(e) {
        await connection.rollback()
        throw e
    }
}

main().then(() => {
    console.log('All ok')
    process.exit(0)
}).catch((e) => {
    console.error(e)
    process.exit(1)
})
