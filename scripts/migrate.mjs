import {neon} from '@neondatabase/serverless';
if(!process.env.DATABASE_URL)throw new Error('Add DATABASE_URL before running migrations.');
const sql=neon(process.env.DATABASE_URL);
await sql.transaction([
 sql`CREATE TABLE IF NOT EXISTS crate (user_id text NOT NULL, topic_id text NOT NULL, saved_at bigint NOT NULL, PRIMARY KEY(user_id,topic_id))`,
 sql`CREATE TABLE IF NOT EXISTS corner_draft (id text PRIMARY KEY, user_id text NOT NULL, lookup text NOT NULL, status text NOT NULL DEFAULT 'ready', result text, updated_at bigint NOT NULL)`,
 sql`CREATE TABLE IF NOT EXISTS corner_usage (scope text PRIMARY KEY, count integer NOT NULL DEFAULT 0)`,
 sql`CREATE TABLE IF NOT EXISTS generation_call (id text PRIMARY KEY, model text NOT NULL, created_at bigint NOT NULL, status text NOT NULL, response text)`
]);
console.log('threeangle database schema ready.');
