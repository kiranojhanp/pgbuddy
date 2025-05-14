import postgres from "postgres";
import { PgClient } from "../src";

// PostgreSQL connection
const sql = postgres("postgres://username:password@localhost:5432/dbname");

// Create PgClient instance
const db = new PgClient(sql);

// Define your table type
interface User {
    id: number;
    name: string;
    email: string;
    status: "active" | "inactive";
    created_at: Date;
}

// Define table
const users = db.table<User>("users");

// Usage examples
async function examples() {
    try {
        // Find all users
        const allUsers = await users.findMany();
        console.log("All users:", allUsers);

        // Find all active users
        const activeUsers = await users.where({ status: "active" }).findMany();
        console.log("Active users:", activeUsers);

        // Find a specific user
        const user = await users.where({ id: 1 }).findUnique();
        console.log("User with ID 1:", user);

        // Select specific fields
        const userEmails = await users.select(["id", "email"]).findMany();
        console.log("User emails:", userEmails);

        // Pagination
        const paginatedUsers = await users
            .skip(10)
            .take(5)
            .orderBy([{ column: "created_at", direction: "DESC" }])
            .findMany();
        console.log("Paginated users:", paginatedUsers);

        // Create a user
        const newUser = await users.create({
            name: "John Doe",
            email: "john@example.com",
            status: "active",
            created_at: new Date(),
        });
        console.log("New user:", newUser);

        // Update a user
        const updatedUser = await users
            .where({ id: 1 })
            .update({ status: "inactive" });
        console.log("Updated user:", updatedUser);

        // Delete a user
        const deletedUser = await users.where({ id: 1 }).delete();
        console.log("Deleted user:", deletedUser);

        // Count users
        const userCount = await users.where({ status: "active" }).count();
        console.log("Active user count:", userCount);

        // Advanced where conditions
        const advancedQuery = await users
            .where([
                { field: "name", operator: "LIKE", value: "John", pattern: "startsWith" },
                { field: "created_at", operator: ">", value: new Date("2023-01-01") }
            ])
            .findMany();
        console.log("Advanced query results:", advancedQuery);

        // Find first matching record
        const firstActiveUser = await users
            .where({ status: "active" })
            .orderBy([{ column: "created_at", direction: "DESC" }])
            .findFirst();
        console.log("First active user:", firstActiveUser);

    } catch (error) {
        console.error("Error:", error);
    } finally {
        // Close the connection
        await sql.end();
    }
}

// Run examples
examples();
