/*
 * npm install mysql2
 * docker run --name ts-sql-query-mysql -p 3306:3306 -e MYSQL_ROOT_PASSWORD=my-secret-pw -d mysql:5.7.29
 */

import { Table } from "../Table";
import { assertEquals } from "./assertEquals";
import { ConsoleLogQueryRunner } from "../queryRunners/ConsoleLogQueryRunner";
import { MySqlConnection } from '../connections/MySqlConnection';
import { createPool } from "mysql2"
import { MySql2PoolQueryRunner } from "../queryRunners/MySql2PoolQueryRunner";

class DBConection extends MySqlConnection<'DBConnection'> {
    increment(i: number) {
        return this.executeFunction('increment', [this.const(i, 'int')], 'int', 'required')
    }
    appendToAllCompaniesName(aditional: string) {
        return this.executeProcedure('append_to_all_companies_name', [this.const(aditional, 'string')])
    }
}

const tCompany = new class TCompany extends Table<DBConection, 'TCompany'> {
    id = this.autogeneratedPrimaryKey('id', 'int');
    name = this.column('name', 'string');
    parentId = this.optionalColumn('parent_id', 'int');
    constructor() {
        super('company'); // table name in the database
    }
}()

const tCustomer = new class TCustomer extends Table<DBConection, 'TCustomer'> {
    id = this.autogeneratedPrimaryKey('id', 'int');
    firstName = this.column('first_name', 'string');
    lastName = this.column('last_name', 'string');
    birthday = this.optionalColumn('birthday', 'localDate');
    companyId = this.column('company_id', 'int');
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

const pool = createPool({
    connectionLimit: 10,
    host: 'localhost',
    user: 'root',
    password: 'my-secret-pw',
    database: 'sys'
})

async function main() {
    const connection = new DBConection(new ConsoleLogQueryRunner(new MySql2PoolQueryRunner(pool)))
    await connection.beginTransaction()

    try {
        await connection.queryRunner.executeDatabaseSchemaModification(`drop table if exists customer`)
        await connection.queryRunner.executeDatabaseSchemaModification(`drop table if exists company`)
        await connection.queryRunner.executeDatabaseSchemaModification(`drop function if exists increment`)
        await connection.queryRunner.executeDatabaseSchemaModification(`drop procedure if exists append_to_all_companies_name`)

        await connection.queryRunner.executeDatabaseSchemaModification(`
            create table company (
                id int auto_increment primary key,
                name varchar(100) not null,
                parent_id int null references company(id)
            )
        `)

        await connection.queryRunner.executeDatabaseSchemaModification(`
            create table customer (
                id int auto_increment primary key,
                first_name varchar(100) not null,
                last_name varchar(100) not null,
                birthday date,
                company_id int not null references company(id)
            )
        `)

        await connection.queryRunner.executeDatabaseSchemaModification(`
            create function increment(i int) returns int deterministic
                begin
                    return i + 1;
                end
        `)

        await connection.queryRunner.executeDatabaseSchemaModification(`
            create procedure append_to_all_companies_name(aditional varchar(100))
                begin
                    update company set name = concat(name, aditional);
                end
        `)

        await connection.queryRunner.executeDatabaseSchemaModification(`drop table if exists record`)
        await connection.queryRunner.executeDatabaseSchemaModification(`
            create table record (
                id binary(16) primary key,
                title varchar(100) not null
            )
        `)

        let i = await connection
            .insertInto(tCompany)
            .values({ name: 'ACME' })
            .returningLastInsertedId()
            .executeInsert()
        assertEquals(i, 1)

        i = await connection
            .insertInto(tCompany)
            .values({ name: 'FOO' })
            .executeInsert()
        assertEquals(i, 1)

        i = await connection
            .insertInto(tCustomer)
            .values({ firstName: 'John', lastName: 'Smith', companyId: 1 })
            .returningLastInsertedId()
            .executeInsert()
        assertEquals(i, 1)
                
        i = await connection
            .insertInto(tCustomer)
            .values({ firstName: 'Other', lastName: 'Person', companyId: 1 })
            .returningLastInsertedId()
            .executeInsert()
        assertEquals(i, 2)

        i = await connection
            .insertInto(tCustomer)
            .values({ firstName: 'Jane', lastName: 'Doe', companyId: 1 })
            .returningLastInsertedId()
            .executeInsert()
        assertEquals(i, 3)

        let company = await connection
            .selectFrom(tCompany)
            .where(tCompany.id.equals(1))
            .select({
                id: tCompany.id,
                name: tCompany.name
            })
            .executeSelectOne()
        assertEquals(company, { id: 1, name: 'ACME' })

        let companies = await connection
            .selectFrom(tCompany)
            .select({
                id: tCompany.id,
                name: tCompany.name
            })
            .orderBy('id')
            .executeSelectMany()
        assertEquals(companies, [{ id: 1, name: 'ACME' }, { id: 2, name: 'FOO' }])

        let name = await connection
            .selectFrom(tCompany)
            .where(tCompany.id.equals(1))
            .selectOneColumn(tCompany.name)
            .executeSelectOne()
        assertEquals(name, 'ACME')

        let names = await connection
            .selectFrom(tCompany)
            .selectOneColumn(tCompany.name)
            .orderBy('result')
            .executeSelectMany()
        assertEquals(names, ['ACME', 'FOO'])

        i = await connection
            .insertInto(tCompany)
            .from(
                connection
                .selectFrom(tCompany)
                .select({
                    name: tCompany.name.concat(' 2')
                })
            )
            .executeInsert()
        assertEquals(i, 2)

        names = await connection
            .selectFrom(tCompany)
            .selectOneColumn(tCompany.name)
            .orderBy('result')
            .executeSelectMany()
        assertEquals(names, ['ACME', 'ACME 2', 'FOO', 'FOO 2'])

        const fooComanyNameLength = connection
            .selectFrom(tCompany)
            .selectOneColumn(tCompany.name.length())
            .where(tCompany.id.equals(2))
            .forUseAsInlineQueryValue()

        companies = await connection
            .selectFrom(tCompany)
            .select({
                id: tCompany.id,
                name: tCompany.name
            })
            .where(tCompany.name.length().greaterThan(fooComanyNameLength))
            .orderBy('id')
            .executeSelectMany()
        assertEquals(companies, [{ id: 1, name: 'ACME' },{ id: 3, name: 'ACME 2' }, { id: 4, name: 'FOO 2'}])

        i = await connection
            .update(tCompany)
            .set({
                name: tCompany.name.concat(tCompany.name)
            })
            .where(tCompany.id.equals(2))
            .executeUpdate()
        assertEquals(i, 1)

        name = await connection
            .selectFrom(tCompany)
            .where(tCompany.id.equals(2))
            .selectOneColumn(tCompany.name)
            .executeSelectOne()
        assertEquals(name, 'FOOFOO')

        i = await connection
            .deleteFrom(tCompany)
            .where(tCompany.id.equals(2))
            .executeDelete()
        assertEquals(i, 1)

        let maybe = await connection
            .selectFrom(tCompany)
            .where(tCompany.id.equals(2))
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
                { id: 1, name: 'John Smith' },
                { id: 2, name: 'Other Person' }
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
            { acmeCompanyId: 1, acmeCompanyName: 'ACME', acmeEndsWithME: true, acmeCustomerCount: 3 }
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
            .where(tCompany.id.equals(1))
            .select({
                id: tCompany.id,
                name: tCompany.name,
                customers: aggregatedCustomersOfAcme
            })
            .executeSelectOne()
        acmeCompanyWithCustomers.customers!.sort((a, b) => {
            return a.id - b.id
        })
        assertEquals(acmeCompanyWithCustomers, {
            id: 1,
            name: 'ACME',
            customers: [
                { id: 1, firstName: 'John', lastName: 'Smith' },
                { id: 2, firstName: 'Other', lastName: 'Person' },
                { id: 3, firstName: 'Jane', lastName: 'Doe' }
            ]
        })

        const tCustomerLeftJoin = tCustomer.forUseInLeftJoin()
        const acmeCompanyWithCustomers2 = await connection.selectFrom(tCompany).leftJoin(tCustomerLeftJoin).on(tCustomerLeftJoin.companyId.equals(tCompany.id))
            .where(tCompany.id.equals(1))
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
        acmeCompanyWithCustomers2.customers!.sort((a, b) => {
            return a.id - b.id
        })
        assertEquals(acmeCompanyWithCustomers2, {
            id: 1,
            name: 'ACME',
            customers: [
                { id: 1, firstName: 'John', lastName: 'Smith' },
                { id: 2, firstName: 'Other', lastName: 'Person' },
                { id: 3, firstName: 'Jane', lastName: 'Doe' }
            ]
        })

        const aggregatedCustomersOfAcme3 = connection.subSelectUsing(tCompany).from(tCustomer)
            .where(tCustomer.companyId.equals(tCompany.id))
            .selectOneColumn(connection.aggregateAsArrayOfOneColumn(tCustomer.firstName.concat(' ').concat(tCustomer.lastName)))
            .forUseAsInlineQueryValue()

        const acmeCompanyWithCustomers3 = await connection.selectFrom(tCompany)
            .where(tCompany.id.equals(1))
            .select({
                id: tCompany.id,
                name: tCompany.name,
                customers: aggregatedCustomersOfAcme3.useEmptyArrayForNoValue()
            })
            .executeSelectOne()
        acmeCompanyWithCustomers3.customers.sort()
        assertEquals(acmeCompanyWithCustomers3, {
            id: 1,
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
            .where(tCompany.id.equals(1))
            .select({
                id: tCompany.id,
                name: tCompany.name,
                customers: aggregatedCustomersOfAcme4
            })
            .executeSelectOne()
        acmeCompanyWithCustomers4.customers!.sort((a, b) => {
            return a.id - b.id
        })
        assertEquals(acmeCompanyWithCustomers4, {
            id: 1,
            name: 'ACME',
            customers: [
                { id: 1, firstName: 'John', lastName: 'Smith' },
                { id: 2, firstName: 'Other', lastName: 'Person' },
                { id: 3, firstName: 'Jane', lastName: 'Doe' }
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
            .where(tCompany.id.equals(1))
            .select({
                id: tCompany.id,
                name: tCompany.name,
                customers: aggregatedCustomersOfAcme5
            })
            .executeSelectOne()
        assertEquals(acmeCompanyWithCustomers5, {
            id: 1,
            name: 'ACME',
            customers: [
                { id: 1, firstName: 'John', lastName: 'Smith' },
                { id: 2, firstName: 'Other', lastName: 'Person' },
                { id: 3, firstName: 'Jane', lastName: 'Doe' }
            ]
        })

        const aggregatedCustomersOfAcme6 = connection.subSelectUsing(tCompany).from(tCustomer)
            .where(tCustomer.companyId.equals(tCompany.id))
            .selectOneColumn(tCustomer.firstName.concat(' ').concat(tCustomer.lastName))
            .forUseAsInlineAggregatedArrayValue()

        const acmeCompanyWithCustomers6 = await connection.selectFrom(tCompany)
            .where(tCompany.id.equals(1))
            .select({
                id: tCompany.id,
                name: tCompany.name,
                customers: aggregatedCustomersOfAcme6.useEmptyArrayForNoValue()
            })
            .executeSelectOne()
        acmeCompanyWithCustomers6.customers.sort()
        assertEquals(acmeCompanyWithCustomers6, {
            id: 1,
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
            .where(tCompany.id.equals(1))
            .select({
                id: tCompany.id,
                name: tCompany.name,
                customers: aggregatedCustomersOfAcme7.useEmptyArrayForNoValue()
            })
            .executeSelectOne()
        console.log(await connection.queryRunner.executeSelectOneColumnOneRow('select json_arrayagg(a_1_.result) from (select concat(concat(first_name, ?), last_name) as result from customer where company_id = ? order by result) as a_1_', [' ', 1]))
        console.log(acmeCompanyWithCustomers7)
        assertEquals(acmeCompanyWithCustomers7, {
            id: 1,
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
            .where(tCompany.id.equals(1))
            .select({
                id: tCompany.id,
                name: tCompany.name,
                customers: aggregatedCustomersOfAcme8
            })
            .executeSelectOne()
        acmeCompanyWithCustomers8.customers!.sort((a, b) => {
            return a.id - b.id
        })
        assertEquals(acmeCompanyWithCustomers8, {
            id: 1,
            name: 'ACME',
            customers: [
                { id: 1, firstName: 'John', lastName: 'Smith' },
                { id: 2, firstName: 'Other', lastName: 'Person' },
                { id: 3, firstName: 'Jane', lastName: 'Doe' }
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
            .where(tCompany.id.equals(1))
            .select({
                id: tCompany.id,
                name: tCompany.name,
                customers: aggregatedCustomersOfAcme9
            })
            .executeSelectOne()
        assertEquals(acmeCompanyWithCustomers9, {
            id: 1,
            name: 'ACME',
            customers: [
                { id: 1, firstName: 'John', lastName: 'Smith' },
                { id: 2, firstName: 'Other', lastName: 'Person' },
                { id: 3, firstName: 'Jane', lastName: 'Doe' }
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
            .where(tCompany.id.equals(1))
            .select({
                id: tCompany.id,
                name: tCompany.name,
                customers: aggregatedCustomersOfAcme10.useEmptyArrayForNoValue()
            })
            .executeSelectOne()
        acmeCompanyWithCustomers10.customers.sort()
        assertEquals(acmeCompanyWithCustomers10, {
            id: 1,
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
            .where(tCompany.id.equals(1))
            .select({
                id: tCompany.id,
                name: tCompany.name,
                customers: aggregatedCustomersOfAcme11.useEmptyArrayForNoValue()
            })
            .executeSelectOne()
        assertEquals(acmeCompanyWithCustomers11, {
            id: 1,
            name: 'ACME',
            customers: [
                'Jane Doe',
                'John Smith',
                'Other Person'
            ]
        })

        i = await connection.increment(10)
        assertEquals(i, 11)

        await connection.appendToAllCompaniesName(' Cia.')

        name = await connection
            .selectFrom(tCompany)
            .where(tCompany.id.equals(1))
            .selectOneColumn(tCompany.name)
            .executeSelectOne()
        assertEquals(name, 'ACME Cia.')

        i = await connection.update(tCustomer)
            .from(tCompany)
            .set({
                lastName: tCustomer.lastName.concat(' - ').concat(tCompany.name)
            })
            .where(tCustomer.companyId.equals(tCompany.id))
            .and(tCustomer.id.equals(1))
            .executeUpdate()
        assertEquals(i, 1)

        i = await connection.deleteFrom(tCustomer)
            .using(tCompany)
            .where(tCustomer.companyId.equals(tCompany.id))
            .and(tCustomer.id.equals(1))
            .executeDelete()
        assertEquals(i, 1)

        // For some reason MySql skip the number 5
        // i = await connection.insertInto(tCompany)
        //     .values({name: 'Stuffing 5'})
        //     .returningLastInsertedId()
        //     .executeInsert()
        // assertEquals(i, 5)
        i = await connection.insertInto(tCompany)
            .values({name: 'Stuffing 6'})
            .returningLastInsertedId()
            .executeInsert()
        assertEquals(i, 6)
        i = await connection.insertInto(tCompany)
            .values({name: 'Stuffing 7'})
            .returningLastInsertedId()
            .executeInsert()
        assertEquals(i, 7)

        i = await connection.insertInto(tCompany)
            .values({name: 'Top Company'})
            .returningLastInsertedId()
            .executeInsert()
        assertEquals(i, 8)
        i = await connection.insertInto(tCompany)
            .values({name: 'Mic Company', parentId: 8})
            .returningLastInsertedId()
            .executeInsert()
        assertEquals(i, 9)
        i = await connection.insertInto(tCompany)
            .values({name: 'Low Company', parentId: 9})
            .returningLastInsertedId()
            .executeInsert()
        assertEquals(i, 10)

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
            .where(tCompany.id.equals(10))
            .executeSelectOne()
        assertEquals(lowCompany, { id: 10, name: 'Low Company', parentId: 9, parents: [{ id: 9, name: 'Mic Company', parentId: 8 }, { id: 8, name: 'Top Company' }] })

        const parentCompanies2 = connection.selectFrom(parentCompany)
            .select({
                id: parentCompany.id,
                name: parentCompany.name,
                parentId: parentCompany.parentId
            })
            .where(parentCompany.id.equals(9))
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
            .where(tCompany.id.equals(10))
            .executeSelectOne()
        assertEquals(lowCompany2, { id: 10, name: 'Low Company', parentId: 9, parents: [{ id: 9, name: 'Mic Company', parentId: 8 }, { id: 8, name: 'Top Company' }] })

        const lowCompany3 = await connection.selectFrom(tCompany)
            .select({
                id: tCompany.id,
                name: tCompany.name,
                parentId: tCompany.parentId
            })
            .where(tCompany.id.equals(10))
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
        assertEquals(lowCompany3, { id: 10, name: 'Low Company', parentId: 9, parents: [{ id: 9, name: 'Mic Company', parentId: 8 }, { id: 8, name: 'Top Company' }] })

        i = await connection.insertInto(tRecord).values({
                id: '89bf68fc-7002-11ec-90d6-0242ac120003',
                title: 'My voice memo'
            }).executeInsert()
        assertEquals(i, 1)

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
