import Experience from './experience';
export default async function Home({searchParams}:{searchParams:Promise<{browse?:string}>}){const query=await searchParams;return <Experience startBrowsing={query.browse==='1'}/>;}
