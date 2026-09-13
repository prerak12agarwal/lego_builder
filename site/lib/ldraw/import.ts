import { colorDefinitions, compose, identity, importLimits, normalizeReference, parseDocument, parseUpload, type ImportedPlacement, type ImportedRevision, type LDrawDocument, type PartFetcher, type Transform } from './model.ts';

/** Resolve the complete graph before handing geometry to the renderer. No user text leaves the browser. */
export async function importLDraw(fileName:string,text:string,colorsText:string,fetchPart:PartFetcher,signal:AbortSignal,onProgress:(message:string)=>void=()=>{}):Promise<ImportedRevision> {
  const {root,documents}=parseUpload(fileName,text);
  const warnings=new Set<string>();
  const palette=colorDefinitions(colorsText);
  for(const doc of documents.values())for(const line of doc.customColors){const additions=colorDefinitions(line);for(const [code,color]of additions){if(code==='16')continue;const previous=palette.get(code);if(previous && previous.line!==color.line)throw Error(`Color ${code} is redefined. Export with unique custom color codes.`);palette.set(code,color);}}
  const resolved=new Map<string,LDrawDocument>();const aliases=new Map<string,string>();const sources=new Set<string>();let bytes=0;
  const check=()=>{signal.throwIfAborted();};
  async function resolve(name:string,stack:string[]=[]):Promise<string>{
    check();name=normalizeReference(name);const known=aliases.get(name)||name;
    if(stack.includes(known))throw Error(`Cyclic part reference: ${[...stack,known].join(' → ')}.`);
    if(stack.length>=importLimits.depth)throw Error('The model has too many levels of nested parts.');
    if(resolved.has(known))return known;
    let doc=documents.get(name);let key=name;
    if(!doc){if(!name.endsWith('.dat'))throw Error(`Missing submodel ${name}. Export a packed MPD containing every submodel.`);onProgress(`Resolving ${name} · ${resolved.size} files found`);const file=await fetchPart(name,signal);check();key=normalizeReference(file.path);aliases.set(name,key);if(stack.includes(key))throw Error(`Cyclic part reference: ${key}.`);if(resolved.has(key))return key;doc=parseDocument(key,file.text);sources.add(key);}
    aliases.set(name,key);
    bytes+=new TextEncoder().encode(doc.text).length;
    if(bytes>importLimits.dependencyBytes||resolved.size>=importLimits.documents)throw Error('This model exceeds the import dependency limit. Try a smaller model.');
    resolved.set(key,doc);
    for(const ref of doc.references)await resolve(ref.name,[...stack,key]);
    return key;
  }
  const placements:ImportedPlacement[]=[];
  async function flatten(doc:LDrawDocument,parent:Transform,color:string,rootStep:number|null,stack:string[],inverted=false):Promise<void>{
    check();if(stack.includes(doc.name))throw Error(`Cyclic submodel reference: ${doc.name}.`);if(stack.length>=importLimits.depth)throw Error('Too many nested submodels.');
    if(doc.geometryLines)throw Error(`${doc.name}: model-level primitive geometry is unsupported. Put custom part geometry in an embedded .dat file.`);
    if(doc!==root&&doc.stepMarkers)warnings.add('Submodels are placed as assemblies within their parent step; nested instruction callouts are not displayed.');
    if(doc.rotsteps)warnings.add('ROTSTEP boundaries are preserved. Authored camera rotations are not applied; you can rotate the model freely.');
    for(const ref of doc.references){const transform=compose(parent,ref.transform);const effective=ref.color==='16'?color:ref.color;const step=rootStep??ref.step;const invert=inverted!==ref.invert;const child=documents.get(ref.name);
      if(!ref.name.endsWith('.dat')){if(!child)throw Error(`Missing submodel ${ref.name}. Export a packed MPD containing every submodel.`);await flatten(child,transform,effective,step,[...stack,doc.name],invert);continue;}
      if(placements.length>=importLimits.placements)throw Error(`This test bench supports up to ${importLimits.placements.toLocaleString()} placed parts.`);
      const key=await resolve(ref.name);const part=resolved.get(key)!;
      const direct=effective.match(/^0X2([A-F0-9]{6})$/);const colorInfo=direct?{name:`#${direct[1]}`,hex:`#${direct[1]}`} :palette.get(effective);
      if(!colorInfo)throw Error(`Unknown color ${effective} on ${ref.name}. Include its !COLOUR definition in the file.`);
      placements.push({id:`piece-${placements.length+1}`,part:key,color:effective,colorName:colorInfo.name,colorHex:colorInfo.hex,transform,step,sourceLine:ref.line,name:part.title,origin:sources.has(key)?'official':'embedded',invert});
    }
  }
  await flatten(root,identity,'16',null,[]);
  if(!placements.length)throw Error('The model contains no usable part placements.');
  // Count expanded geometry, including repeated references, to bound renderer allocation.
  const counts=new Map<string,number>();
  function count(key:string,stack:string[]=[]):number{if(stack.includes(key))throw Error(`Cyclic part reference: ${key}.`);if(counts.has(key))return counts.get(key)!;const doc=resolved.get(key)!;let n=doc.geometryLines;for(const r of doc.references)n+=count(aliases.get(r.name)||r.name,[...stack,key]);if(n>importLimits.expandedGeometryLines)throw Error('Part geometry is too complex for this test bench.');counts.set(key,n);return n;}
  let geometry=0;for(const p of placements){const n=count(p.part);if(!n)throw Error(`Part ${p.part} has no renderable geometry.`);geometry+=n;if(geometry>importLimits.expandedGeometryLines)throw Error('The expanded model is too complex for this test bench.');}
  const hasSteps=root.stepMarkers>0;const authored=[...new Set(placements.map(p=>p.step))];
  if(hasSteps && authored.length<root.stepMarkers+1)warnings.add('Empty step boundaries were omitted. Part order within each authored step is preserved.');
  const stepMap=new Map(authored.map((step,i)=>[step,i]));for(const p of placements)p.step=stepMap.get(p.step)!;
  const steps=hasSteps?authored.map((_,i)=>({number:i+1,placementIds:placements.filter(p=>p.step===i).map(p=>p.id)})):[];
  if(placements.some(p=>p.origin==='embedded'))warnings.add('This file includes embedded custom parts. Their catalog identity has not been verified.');
  let rootName='__inspection_root.ldr';while(resolved.has(rootName))rootName='_'+rootName;
  const lines=[`0 FILE ${rootName}`,'0 !LDRAW_ORG Model',...Array.from(palette.values(),c=>c.line)];let last=0;
  for(const p of placements){if(hasSteps&&p.step!==last){lines.push('0 STEP');last=p.step;}if(p.invert)lines.push('0 BFC INVERTNEXT');lines.push(`1 ${p.color.replace('0X','0x')} ${p.transform.join(' ')} ${p.part}`);}
  for(const [key,doc]of resolved){lines.push(`0 FILE ${key}`);if(!doc.lines.some(l=>/^0\s+!LDRAW_ORG\s/i.test(l)))lines.push('0 !LDRAW_ORG Part');const refs=new Map(doc.references.map(r=>[r.line,r]));doc.lines.forEach((line,i)=>{const ref=refs.get(i+1);lines.push(ref?`1 ${ref.color.replace('0X','0x')} ${ref.transform.join(' ')} ${aliases.get(ref.name)||ref.name}`:line);});}
  check();onProgress('Preparing model geometry…');
  return {id:`ldr-${crypto.randomUUID()}`,fileName,title:root.title,placements,steps,hasSteps,warnings:[...warnings],packed:lines.join('\n'),dependencyCount:resolved.size,colorsText,librarySources:[...sources]};
}
