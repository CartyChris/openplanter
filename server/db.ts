import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { integer, jsonb, pgSchema, text, timestamp } from "drizzle-orm/pg-core";

// Neon's transaction pooler rejects startup search_path options; this isolated auth schema needs a direct connection.
export const pool = new Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED, max: 3, options: "-c search_path=openplanter,public" });
export const workspaces = pgSchema("openplanter").table("workspace", {
  userId: text("userId").primaryKey(),
  data: jsonb("data").notNull(),
  revision: integer("revision").notNull().default(1),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
});
export const db = drizzle(pool);
