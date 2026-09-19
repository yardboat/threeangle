import {neon} from '@neondatabase/serverless';
// All query text is server-owned. User values are always bound parameters.
export const databaseUrl=()=>process.env.DATABASE_URL??process.env.ThreeangleSto_DATABASE_URL;
export function crateDb(){
 const url=databaseUrl();
 if(!url)throw new Error('Database is not configured');
 const sql=neon(url);
 return {prepare(query:string){let n=0;const text=query.replace(/\?/g,()=>`$${++n}`);return {bind(...params:(string|number|null)[]){
  const execute=()=>sql.query(text,params);
  return {
   async first<T=Record<string,unknown>>():Promise<T|null>{const rows=await execute();return (rows[0] as T)||null;},
   async all(){return {results:await execute() as Record<string,unknown>[]};},
   async run(){await execute();}
  };
 }}}};
}
