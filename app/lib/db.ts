// import {PrismaClient} from "@prisma/client";
// import {PrismaPg} from "@prisma/adapter-pg";
// import {Pool} from "pg";
//
// // Create a direct Postgres connection
// const pool = new Pool({connectionString: process.env.DATABASE_URL});
//
// // Wrap it in the Prisma Adapter
// const adapter = new PrismaPg(pool);
//
// // Export the Prisma Client using the adapter
// export const db = new PrismaClient({adapter});