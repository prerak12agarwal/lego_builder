/** LDraw import data is separate from the solver's validated stud/plate grid. */
export const importLimits = Object.freeze({ fileBytes: 5 * 1024 * 1024, partBytes: 1024 * 1024, dependencyBytes: 24 * 1024 * 1024, placements: 2500, documents: 1200, depth: 32, lines: 150000, expandedGeometryLines: 1500000, timeoutMs: 600000 });
export type Transform = readonly number[]; // x,y,z followed by a,b,c,d,e,f,g,h,i; exact LDU affine transform.
export type LDrawReference = { name: string; color: string; transform: Transform; line: number; step: number; invert: boolean };
export type LDrawDocument = { name: string; text: string; lines: string[]; references: LDrawReference[]; stepMarkers: number; rotsteps: number; geometryLines: number; title: string; customColors: string[] };
export type ImportedPlacement = { id: string; part: string; color: string; colorName: string; colorHex: string; transform: Transform; step: number; sourceLine: number; name: string; origin: 'official' | 'embedded'; invert: boolean };
export type ImportedStep = { number: number; placementIds: string[] };
export type ImportedRevision = { id: string; fileName: string; title: string; placements: ImportedPlacement[]; steps: ImportedStep[]; hasSteps: boolean; warnings: string[]; packed: string; dependencyCount: number; colorsText: string; librarySources: string[] };
export type ResolvedPart = { path: string; text: string };
export type PartFetcher = (name: string, signal: AbortSignal) => Promise<ResolvedPart>;
export const identity: Transform = [0,0,0,1,0,0,0,1,0,0,0,1];
export function normalizeReference(value: string): string {
  const name=value.trim().replace(/\\/g,'/').toLowerCase();
  if (!name || name.length > 255 || !/^[a-z0-9_ .\-/]+\.(dat|ldr|mpd)$/.test(name) || name.startsWith('/') || name.split('/').some(p=>p==='..'||p==='.'||!p)) throw new Error(`Unsupported file reference: ${value.slice(0,100)}. Use relative LDraw names without URLs or parent paths.`);
  return name;
}
export function validateTransform(values: number[], context: string): Transform {
  if(values.length!==12 || values.some(n=>!Number.isFinite(n)||Math.abs(n)>1e7)) throw new Error(`${context}: invalid or excessive transform values.`);
  const [, , , a,b,c,d,e,f,g,h,i]=values;
  const det=a*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g);
  if(Math.abs(det)<1e-10) throw new Error(`${context}: a singular transform collapses the part.`);
  return values;
}
export function compose(parent: Transform, child: Transform): Transform {
  const result=[0,0,0,...Array(9).fill(0)];
  for(let row=0;row<3;row++) { result[row]=parent[row];for(let k=0;k<3;k++) result[row]+=parent[3+row*3+k]*child[k];for(let col=0;col<3;col++)for(let k=0;k<3;k++)result[3+row*3+col]+=parent[3+row*3+k]*child[3+k*3+col]; }
  return validateTransform(result,'Composed submodel');
}
export function parseDocument(name:string,text:string):LDrawDocument {
  const lines=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n');
  if(lines.length>importLimits.lines)throw Error(`${name}: too many lines.`);
  const references:LDrawReference[]=[]; const customColors:string[]=[]; let step=0,stepMarkers=0,rotsteps=0,geometryLines=0,invert=false;
  const title=lines.find(l=>/^\s*0\s+[^!]/.test(l))?.replace(/^\s*0\s+/,'').slice(0,160)||name;
  lines.forEach((line,index)=>{
    const s=line.trim();if(!s)return;const fields=s.split(/\s+/);const type=fields[0];const context=`${name}, line ${index+1}`;
    if(!/^[0-5]$/.test(type)) throw Error(`${context}: unrecognized LDraw line type.`);
    if(type==='0') {
      if(/^0\s+(STEP|ROTSTEP)(?:\s|$)/i.test(s)){step++;stepMarkers++;if(/\bROTSTEP\b/i.test(s))rotsteps++;}
      if(/^0\s+!COLOUR\s/i.test(s))customColors.push(s);
      if(/^0\s+(!TEXMAP|!DATA|!LPE|CLEAR)(?:\s|$)/i.test(s))throw Error(`${context}: texture, embedded image, conditional geometry, or CLEAR commands are not supported in this importer.`);
      if(/^0\s+BFC\s+INVERTNEXT\s*$/i.test(s))invert=true;
      return;
    }
    if(type==='1') {
      if(fields.length<15)throw Error(`${context}: a part reference needs a color, 12 transform values and a file name.`);
      if(!/^(\d+|0x2[\da-f]{6})$/i.test(fields[1]) || fields[1]==='24')throw Error(`${context}: invalid part color.`);
      const transform=validateTransform(fields.slice(2,14).map(Number),context);
      references.push({name:normalizeReference(fields.slice(14).join(' ')),color:fields[1].toUpperCase(),transform,line:index+1,step,invert});invert=false;
    } else {
      const count=type==='2'?8:type==='3'?11:14;
      if(!/^(\d+|0x2[\da-f]{6})$/i.test(fields[1]) || fields.length!==count || fields.slice(2).some(v=>!Number.isFinite(Number(v))||Math.abs(Number(v))>1e7))throw Error(`${context}: invalid geometry coordinates.`);
      geometryLines++;
    }
  });
  return {name,text:lines.join('\n'),lines,references,stepMarkers,rotsteps,geometryLines,title,customColors};
}
export function parseUpload(fileName:string,text:string):{root:LDrawDocument;documents:Map<string,LDrawDocument>} {
  if(!/\.(ldr|mpd)$/i.test(fileName))throw Error('Choose an .ldr file or a packed .mpd file.');
  if(new TextEncoder().encode(text).length>importLimits.fileBytes)throw Error(`Choose a file up to ${importLimits.fileBytes/1024/1024} MB.`);
  if(text.includes('\0'))throw Error('This is not a text LDraw file. Export an .ldr or .mpd file from your modeling tool.');
  const raw=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');const lines=raw.split('\n');
  const blocks=new Map<string,string[]>();let active:string|null=null;let rootName='';const hasFiles=lines.some(l=>/^\s*0\s+FILE\s/i.test(l));
  if(!hasFiles){rootName='uploaded-model.ldr';blocks.set(rootName,lines);}else{
    for(const line of lines){const file=line.match(/^\s*0\s+FILE\s+(.+)$/i);if(file){active=normalizeReference(file[1]);if(blocks.has(active))throw Error(`Duplicate embedded file: ${active}.`);if(blocks.size>=importLimits.documents)throw Error('Too many embedded files.');blocks.set(active,[]);rootName ||= active;}else if(/^\s*0\s+NOFILE\s*$/i.test(line)){active=null;}else if(active){blocks.get(active)!.push(line);}else if(line.trim()&&!/^\s*0(?:\s|$)/.test(line)){throw Error('Geometry appears outside an MPD FILE block.');}}
  }
  const documents=new Map([...blocks].map(([name,body])=>[name,parseDocument(name,body.join('\n'))]));const root=documents.get(rootName);
  if(!root||!root.references.length)throw Error('No part placements were found in the main model.');
  return {root,documents};
}
export function colorDefinitions(text:string):Map<string,{name:string;hex:string;line:string}> {
  const map=new Map<string,{name:string;hex:string;line:string}>();
  for(const line of text.split(/\r?\n/)){const m=line.match(/^0\s+!COLOUR\s+(.+?)\s+CODE\s+(\d+)\s+VALUE\s+(#[\da-f]{6})\s+EDGE\s+/i);if(m)map.set(m[2],{name:m[1].replace(/_/g,' '),hex:m[3],line});}
  map.set('16',{name:'Current color (default)',hex:'#aaaaaa',line:'0 !COLOUR Main_Colour CODE 16 VALUE #AAAAAA EDGE #333333'});
  return map;
}
export function importedInventory(placements:readonly ImportedPlacement[]) {
  const lots=new Map<string,{key:string;part:string;name:string;color:string;colorName:string;colorHex:string;quantity:number;origin:string}>();
  for(const p of placements){const key=`${p.part}:${p.color}`;const existing=lots.get(key);if(existing)existing.quantity++;else lots.set(key,{key,part:p.part,name:p.name,color:p.color,colorName:p.colorName,colorHex:p.colorHex,quantity:1,origin:p.origin});}
  return [...lots.values()];
}
export function importedCsv(model:ImportedRevision) {
  const quote=(v:unknown)=>{const text=String(v);return '"'+(/^[=+@\-\t\r\n]/.test(text)?"'":'')+text.replace(/"/g,'""')+'"';};
  return ['revision,part,name,color,color_name,quantity',...importedInventory(model.placements).map(l=>[model.id,l.part,l.name,l.color,l.colorName,l.quantity].map(quote).join(','))].join('\r\n');
}
