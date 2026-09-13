import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const jobs = sqliteTable("reconstruction_jobs", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  requestKey: text("request_key").notNull(),
  fingerprint: text("fingerprint").notNull(),
  provider: text("provider").notNull(),
  task: text("task"),
  state: text("state").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  checkedAt: integer("checked_at").notNull().default(0),
  lease: text("lease"),
  leaseUntil: integer("lease_until").notNull().default(0),
  message: text("message"),
  manifest: text("manifest"),
}, (table) => [
  uniqueIndex("job_request_key").on(table.owner, table.requestKey),
  uniqueIndex("one_active_job_per_owner").on(table.owner).where(sql`${table.state} in ('submitting', 'queued', 'generating', 'collecting', 'unknown')`),
  index("owner_job_time").on(table.owner, table.createdAt),
  index("job_time").on(table.createdAt),
]);
