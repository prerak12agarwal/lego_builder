/** Only public official part files can be requested. This is not an arbitrary URL proxy. */
export function officialCandidates(input: string): string[] {
  const name=input.trim().toLowerCase().replace(/\\/g,'/');
  if(name.length>180||!/^[a-z0-9_./-]+\.dat$/.test(name)||name.startsWith('/')||name.split('/').some(s=>!s||s==='.'||s==='..'))throw Error('Invalid official part name.');
  if(name.startsWith('parts/')||name.startsWith('p/'))return [name];
  if(name.startsWith('s/'))return ['parts/'+name];
  if(name.startsWith('48/')||name.startsWith('8/'))return ['p/'+name];
  if(name.includes('/'))throw Error('Unsupported official library directory.');
  return ['parts/'+name,'p/'+name];
}
