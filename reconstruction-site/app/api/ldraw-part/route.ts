import {servePart,type PublicPartCache} from '@/lib/ldraw/part-service';
export async function GET(request:Request){
  // Cache contains only public official geometry and short-lived official 404s, never uploads.
  let cache:PublicPartCache|undefined;
  try{cache=await caches.open('ldraw-official-v1') as unknown as PublicPartCache;}catch{/* Local runtimes without Cache API still use the bounded resolver. */}
  return servePart(request,fetch,cache);
}
