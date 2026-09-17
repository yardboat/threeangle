import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
export const crate=sqliteTable('crate',{
 userId:text('user_id').notNull(),topicId:text('topic_id').notNull(),savedAt:integer('saved_at').notNull(),
},t=>[primaryKey({columns:[t.userId,t.topicId]})]);
export const cornerDraft=sqliteTable('corner_draft',{
 id:text('id').primaryKey(),userId:text('user_id').notNull(),lookup:text('lookup').notNull(),status:text('status').notNull().default('ready'),result:text('result'),updatedAt:integer('updated_at').notNull(),
});
export const cornerUsage=sqliteTable('corner_usage',{
 scope:text('scope').primaryKey(),count:integer('count').notNull().default(0),
});
