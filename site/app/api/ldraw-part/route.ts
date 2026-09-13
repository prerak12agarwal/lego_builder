import { officialCandidates } from '@/lib/ldraw/library-path';
import { importLimits } from '@/lib/ldraw/model';
export async function GET(request: Request) {
  let paths:string[];
  try{paths=officialCandidates(new URL(request.url).searchParams.get('file')??'');}catch{return Response.json({error:'Invalid official part name.'},{status:400});}
  for(const path of paths){
    try{
      const upstream=await fetch('https://library.ldraw.org/library/official/'+path,{redirect:'manual',signal:AbortSignal.timeout(15000)});
      if(upstream.status===404)continue;
      if(!upstream.ok)return Response.json({error:'The official parts library is unavailable. Try again.'},{status:502});
      if(Number(upstream.headers.get('content-length'))>importLimits.partBytes)return Response.json({error:'This part exceeds the preview size limit.'},{status:413});
      const reader=upstream.body?.getReader();if(!reader)throw Error('Missing part data');let size=0;const chunks:Uint8Array[]=[];
      try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>importLimits.partBytes){await reader.cancel();return Response.json({error:'This part exceeds the preview size limit.'},{status:413});}chunks.push(value);}}finally{reader.releaseLock();}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}const text=new TextDecoder().decode(bytes);
      if(!/^\s*0\s/m.test(text)||/^\s*</.test(text))throw Error('Not LDraw data');
      return Response.json({path,text},{headers:{'Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'}});
    }catch(error){console.warn('LDraw library request failed', path, error instanceof Error ? error.message : 'Unknown error');return Response.json({error:'Could not reach the official parts library. Try importing again.'},{status:502});}
  }
  return Response.json({error:'This part was not found in the official LDraw library. Pack custom parts into an MPD file.'},{status:404});
}
