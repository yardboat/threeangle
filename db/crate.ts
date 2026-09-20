import {neon} from '@neondatabase/serverless';
// All query text is server-owned. User values are always bound parameters.
export const databaseUrl=()=>process.env.DATABASE_URL
 ||process.env.ThreeangleSto_DATABASE_URL
 ||process.env.ThreeangleSto_POSTGRES_URL
 ||process.env.ThreeangleSto_POSTGRES_PRISMA_URL
 ||process.env.ThreeangleSto_DATABASE_URL_UNPOOLED
 ||process.env.ThreeangleSto_POSTGRES_URL_NON_POOLING;
let schemaReady:Promise<unknown>|undefined;
export function crateDb(){
 const url=databaseUrl();
 if(!url)throw new Error('Database is not configured');
 const sql=neon(url);
 schemaReady??=sql.transaction([
  sql`CREATE TABLE IF NOT EXISTS crate (user_id text NOT NULL, topic_id text NOT NULL, saved_at bigint NOT NULL, PRIMARY KEY(user_id,topic_id))`,
  sql`CREATE TABLE IF NOT EXISTS corner_draft (id text PRIMARY KEY, user_id text NOT NULL, lookup text NOT NULL, status text NOT NULL DEFAULT 'ready', result text, updated_at bigint NOT NULL)`,
  sql`CREATE TABLE IF NOT EXISTS corner_usage (scope text PRIMARY KEY, count integer NOT NULL DEFAULT 0)`,
  sql`CREATE TABLE IF NOT EXISTS generation_call (id text PRIMARY KEY, model text NOT NULL, created_at bigint NOT NULL, status text NOT NULL, response text)`
 ]).catch(error=>{schemaReady=undefined;throw error});
 return {prepare(query:string){let n=0;const text=query.replace(/\?/g,()=>`$${++n}`);return {bind(...params:(string|number|null)[]){
  const execute=async()=>{await schemaReady;return sql.query(text,params)};
  return {
   async first<T=Record<string,unknown>>():Promise<T|null>{const rows=await execute();return (rows[0] as T)||null;},
   async all(){return {results:await execute() as Record<string,unknown>[]};},
   async run(){await execute();}
  };
 }}}};
}
