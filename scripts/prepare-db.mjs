if(process.env.DATABASE_URL)await import('./migrate.mjs');
else console.log('DATABASE_URL is not configured: curated browsing builds; custom generation stays disabled.');
