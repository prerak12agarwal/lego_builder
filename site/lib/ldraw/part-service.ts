import {officialCandidates} from './library-path.ts';
import {importLimits} from './model.ts';
export type PublicPartCache={match:(key:Request)=>Promise<Response|undefined>;put:(key:Request,response:Response)=>Promise<unknown>};
export async function servePart(request:Request,upstreamFetch:typeof fetch=fetch,cache?:PublicPartCache):Promise<Response>{
  let paths:string[];try{paths=officialCandidates(new URL(request.url).searchParams.get('file')??'');}catch{return Response.json({error:'Invalid official part name.'},{status:400});}
  let contacted=false;
  const error=(message:string,status:number,retry?:string)=>Response.json({error:message},{status,headers:{'Cache-Control':'no-store',...(retry?{'Retry-After':retry}:{})}});
  for(const path of paths){
    if(request.signal.aborted)return error('Import cancelled.',499);
    const cacheKey=new Request(new URL('/__ldraw-official-cache/v1/'+path,request.url));
    const cached=await cache?.match(cacheKey).catch(()=>undefined);
    if(cached){if(cached.status===404)continue;const headers=new Headers(cached.headers);headers.set('X-LDraw-Cache',contacted?'MISS':'HIT');return new Response(cached.body,{status:cached.status,headers});}
    try{
      if(request.signal.aborted)return error('Import cancelled.',499);
      contacted=true;const upstream=await upstreamFetch('https://library.ldraw.org/library/official/'+path,{redirect:'manual',signal:AbortSignal.any([request.signal,AbortSignal.timeout(15000)])});
      if(upstream.status===404){await upstream.body?.cancel();await cache?.put(cacheKey,new Response(null,{status:404,headers:{'Cache-Control':'public, max-age=3600'}})).catch(()=>{});continue;}
      if(upstream.status===429){const retry=upstream.headers.get('Retry-After')||'60';await upstream.body?.cancel();return error('The official parts library is rate-limiting requests. The importer will wait and retry.',429,retry);}
      if(!upstream.ok){const status=upstream.status;const retry=upstream.headers.get('Retry-After');await upstream.body?.cancel();console.warn('LDraw upstream response',path,status);return error(`The official parts library returned HTTP ${status}. Please retry.`,502,retry??undefined);}
      if(Number(upstream.headers.get('content-length'))>importLimits.partBytes){await upstream.body?.cancel();return error('This part exceeds the preview size limit.',413);}
      const reader=upstream.body?.getReader();if(!reader)throw Error('Missing part data');let size=0;const chunks:Uint8Array[]=[];
      try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>importLimits.partBytes){await reader.cancel();return error('This part exceeds the preview size limit.',413);}chunks.push(value);}}finally{reader.releaseLock();}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}const text=new TextDecoder().decode(bytes);
      if(!/^\s*0\s/m.test(text)||/^\s*</.test(text))throw Error('Not LDraw data');
      const result=Response.json({path,text},{headers:{'Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff','X-LDraw-Cache':'MISS'}});
      await cache?.put(cacheKey,result.clone()).catch(()=>{});return result;
    }catch(errorValue){if(request.signal.aborted)return error('Import cancelled.',499);console.warn('LDraw library request failed',path,errorValue instanceof Error?errorValue.message:'Unknown error');return error('Could not reach the official parts library. Please retry.',502);}
  }
  return error('This part was not found in the official LDraw library. Pack custom parts into an MPD file.',404);
}
