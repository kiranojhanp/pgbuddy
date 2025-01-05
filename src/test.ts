// // This small utility script only interacts with `postgres.js` and is designed for simplicity.
// // A dedicated test runner would add unnecessary complexity and maintenance overhead.
// // To minimize technical debt, testing will be conducted manually.
// // To run the tests, use: `dotenv -e .env.local tsx test.ts` and uncomment, check and comment the tests.

// // import {PgBuddy} from "./index";
// // import { sql } from "./sql";

// async function Tests() {
//   // const pgBuddy = new PgBuddy(sql);

//   // ------- Empty table name -------
//   //   should throw an error for empty table name
//   //   const emptyTableNameResult = await pgBuddy.select({
//   //     table: ""
//   //   });

//   // ------- invalid Table name -------
//   //   should throw an error for invalid table names
//   //   const invalidTableNameResult = await pgBuddy.select({
//   //     table: "asdf",
//   //   });

//   // ------- Empty column name -------
//   //   should throw an error for empty column names
//   // const emptyColumnsNameResult = await pgBuddy.select({
//   //   table: "user",
//   //   columns: [""]
//   // });

//   // ------- invalid Table name -------
//   //   should throw an error for invalid column names
//   // const invalidColumnNameResult = await pgBuddy.select({
//   //   table: "user",
//   //   columns: ["user_id", "name", "email", "created_at", "asdf"],
//   // });

//   // ------- invalid Search params -------
//   //   should throw an error for invalid Search params
//   //   const invalidSearchParamsResult = await pgBuddy.select({
//   //     table: "user",
//   //     columns: ["user_id", "name", "email", "created_at"],
//   //     // search: { columns: [""], query: "example.com" }, // empty column
//   //     // search: { columns: ["user"], query: "" }, // empty search query
//   //     // search: { columns: ["user"], query: "example.com" }, // invalid columns
//   //   });

//   // ------- Single column search -------
//   //   const singleColumnSearchResult = await pgBuddy.select({
//   //     table: "user",
//   //     columns: ["user_id", "name", "email", "created_at"],
//   //     search: { columns: ["email"], query: "gmail.com" },
//   //     page: 1,
//   //     pageSize: 10,
//   //     // debug: true
//   //   });
//   //   console.log({ singleColumnSearch: singleColumnSearchResult });

//   // ------- Multi column search -------
//   //   const multiColumnSearchResult = await pgBuddy.select({
//   //     table: "user",
//   //     columns: ["user_id", "name", "email", "created_at"],
//   //     search: { columns: ["name", "email"], query: "john" },
//   //     page: 1,
//   //     pageSize: 10,
//   //     // debug: true
//   //   });
//   //   console.log({ multiColumnSearch: multiColumnSearchResult });

//   // ------- Sort and pagination -------
//   //   const sortAndPaginationResult = await pgBuddy.select({
//   //     table: "user",
//   //     columns: ["user_id", "name", "email", "created_at"],
//   //     orderBy: "name ASC",
//   //     page: 3,
//   //     pageSize: 5,
//   //   });
//   //   console.log({ sortAndPagination: sortAndPaginationResult });

//   // ------- test SQL injection in table and column names -------
//   //   should throw an error in case of SQL injection attacks
//   // const tableSqlInjectionResult = await pgBuddy.select({
//   //   table: 'user"; DROP TABLE user;--',
//   //   columns: ["user_id", "name", "email", "created_at"],
//   // });
//   //   const columnSqlInjectionResult = await pgBuddy.select({
//   //     table: "user",
//   //     columns: ["user_id", "name", 'email"; DROP TABLE users;--'],
//   //   });

//   // ------- test SQL injection in search query -------
//   //   should throw an error in case of SQL injection attacks in search query
//   //   const searchSqlInjectionResult = await pgBuddy.select({
//   //     table: "user",
//   //     columns: ["user_id", "email"],
//   //     search: { columns: ["email"], query: '"; DROP TABLE test;--' },
//   //     debug: true,
//   //   });
//   //   console.log({ searchSqlInjection: searchSqlInjectionResult });
//   //   This should run but show zero results. Parameters are automatically extracted and handled by the database so that SQL injection isn't possible.
//   //   To verify, set debug: true and check the output. The malicious string is passed as a parameter ($1), so it cannot alter the query structure.
// }

// Tests();
