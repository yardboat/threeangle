import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'threeangle / Find your next fascination.',description:'Explore 24 topics through a book, a film, and a podcast episode. Three great works, one deeper perspective.',icons:{icon:'/favicon.svg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
