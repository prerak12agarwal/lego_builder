import { ReconstructionProviderError, safeMessage } from "./errors.ts";

const MODEL = "fal-ai/trellis", BASE = `https://queue.fal.run/${MODEL}`;
export type ReconstructionStatus = "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "CANCELED";
export interface ReconstructionTask { id: string; status: ReconstructionStatus; modelUrl?: string; }
export interface FalTrellisClientOptions { apiKey: string; fetch: typeof globalThis.fetch; }
function status(value: unknown): ReconstructionStatus { const v=String(value); if(v==="IN_QUEUE"||v==="PENDING")return "PENDING";if(v==="IN_PROGRESS")return "IN_PROGRESS";if(v==="COMPLETED"||v==="SUCCEEDED")return "SUCCEEDED";if(v==="CANCELLED"||v==="CANCELED")return "CANCELED";return "FAILED"; }
export class FalTrellisClient {
  private readonly options: FalTrellisClientOptions;
  constructor(options: FalTrellisClientOptions) { this.options=options; if(!options.apiKey)throw new ReconstructionProviderError("Provider API key is missing"); }
  private async call(path:string, init?:RequestInit):Promise<any>{let r:Response;try{r=await this.options.fetch(`${BASE}${path}`,{...init,headers:{Authorization:`Key ${this.options.apiKey}`,"Content-Type":"application/json",...(init?.headers??{})}});}catch{throw new ReconstructionProviderError("Provider request could not be completed",undefined,true);}const text=await r.text();let body:any={};try{body=text?JSON.parse(text):{};}catch{}if(!r.ok)throw new ReconstructionProviderError(safeMessage(body.detail??body.message??`Provider request failed (${r.status})`),r.status,r.status===429||r.status>=500);return body;}
  async create(imageDataUri:string):Promise<ReconstructionTask>{const b=await this.call("",{method:"POST",body:JSON.stringify({image_url:imageDataUri,mesh_simplify:0.98,texture_size:512})});const id=b.request_id;if(typeof id!=="string")throw new ReconstructionProviderError("Provider returned an invalid task");return{id,status:"PENDING"};}
  async get(id:string):Promise<ReconstructionTask>{const s=await this.call(`/requests/${encodeURIComponent(id)}/status`);const mapped=status(s.status);if(mapped==="FAILED"&&(s.error||s.error_type))throw new ReconstructionProviderError(safeMessage(s.error??s.error_type));if(mapped!=="SUCCEEDED")return{id,status:mapped};const result=await this.call(`/requests/${encodeURIComponent(id)}`);if(result.error||result.error_type)throw new ReconstructionProviderError(safeMessage(result.error??result.error_type));const url=result?.model_mesh?.url;if(typeof url!=="string")throw new ReconstructionProviderError("Provider returned no mesh URL");return{id,status:mapped,modelUrl:url};}
  async cancel(id:string):Promise<void>{await this.call(`/requests/${encodeURIComponent(id)}/cancel`,{method:"PUT"});}
}
