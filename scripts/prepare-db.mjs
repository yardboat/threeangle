if(process.env.DATABASE_URL)await import('./migrate.mjs');
else console.log('DATABASE_URL is not configured during build; runtime will initialize a connected Neon database.');
