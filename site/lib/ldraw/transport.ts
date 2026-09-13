import { importLimits, type ResolvedPart } from './model.ts';
import { officialCandidates } from './library-path.ts';
export function retryDelay(value:string|null,now=Date.now()):number {
  if(!value)return 60000;
  const seconds=Number(value);const delay=Number.isFinite(seconds)?seconds*1000:Date.parse(value)-now;
  return Number.isFinite(delay)?Math.max(1000,delay):60000;
}
export function abortableWait(ms:number,signal:AbortSignal):Promise<void>{
  signal.throwIfAborted();return new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(signal.reason);};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);signal.addEventListener('abort',abort,{once:true});});
}
/** Cache public library files only. Uploaded models and embedded parts never enter this cache. */
export function createPartTransport(options:{fetch?:typeof fetch;wait?:typeof abortableWait;now?:()=>number}={}) {
  const request=options.fetch??fetch;const wait=options.wait??abortableWait;const now=options.now??Date.now;
  const cache=new Map<string,{part:ResolvedPart;expires:number;bytes:number}>();let bytes=0;let nextRequest=0;
  return async(name:string,signal:AbortSignal,progress:(message:string)=>void=()=>{}):Promise<ResolvedPart>=>{
    signal.throwIfAborted();const candidates=officialCandidates(name);const key=candidates.join('|');const hit=cache.get(key);
    if(hit&&hit.expires>now())return hit.part;
    if(hit){bytes-=hit.bytes;cache.delete(key);}
    for(let attempt=0;attempt<5;attempt++){
      await wait(Math.max(0,nextRequest-now()),signal);signal.throwIfAborted();let response:Response;
      try{response=await request('/api/ldraw-part?file='+encodeURIComponent(name),{signal});}
      catch(error){signal.throwIfAborted();if(attempt===4)throw Error(`${name}: connection interrupted. Please try importing again.`);const delay=2000*2**attempt;nextRequest=now()+delay;progress(`Connection interrupted. Retrying ${name} in ${delay/1000} seconds…`);continue;}
      // A lookup may consume two upstream requests (parts, then primitives). Pace cold lookups below 60/minute.
      nextRequest=now()+(response.headers.get('X-LDraw-Cache')==='HIT'?0:2200);
      if([429,502,503,504].includes(response.status)&&attempt<4){const delay=response.status===429?retryDelay(response.headers.get('Retry-After'),now()):Math.max(2000*2**attempt,response.headers.has('Retry-After')?retryDelay(response.headers.get('Retry-After'),now()):0);if(delay>180000)throw Error(`${name}: the parts library requested a long pause. Please try again later.`);nextRequest=Math.max(nextRequest,now()+delay);progress(`Parts library is busy. Retrying ${name} in ${Math.ceil(delay/1000)} seconds…`);continue;}
      const data=await response.json().catch(()=>null) as {path?:string;text?:string;error?:string}|null;
      if(!response.ok)throw Error(`${name}: ${data?.error??'The part service could not complete the request. Try again later.'}`);
      if(!data||typeof data.text!=='string'||typeof data.path!=='string'||!candidates.includes(data.path))throw Error(`${name}: the part service returned invalid data.`);
      const size=new TextEncoder().encode(data.text).length;if(size>importLimits.partBytes)throw Error(`${name}: this part exceeds the preview size limit.`);
      while(bytes+size>importLimits.dependencyBytes&&cache.size){const first=cache.keys().next().value!;bytes-=cache.get(first)!.bytes;cache.delete(first);}
      const part={path:data.path,text:data.text};cache.set(key,{part,bytes:size,expires:now()+86400000});bytes+=size;return part;
    }
    throw Error(`${name}: retry limit reached.`);
  };
}
