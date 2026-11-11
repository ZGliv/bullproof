export type SyncOp={id:string;key:string;value:unknown};
export type StoredOp=SyncOp&{seq:number};
export function flatten(terminal:string|null,interests:string|null):Record<string,unknown>{
 const t=JSON.parse(terminal||'{}'),i=JSON.parse(interests||'{}');const out:Record<string,unknown>={};
 for(const x of t.watchlist??[])out['save:'+x]=true;
 for(const x of t.seen??[])out['seen:'+x]=true;
 for(const [k,v] of Object.entries(t.notes??{}))out['note:'+k]=v;
 for(const [k,v] of Object.entries(i.items??{}))out['interest:'+k]=v;
 return out;
}
export function delta(before:Record<string,unknown>,after:Record<string,unknown>):SyncOp[]{return [...new Set([...Object.keys(before),...Object.keys(after)])].filter(k=>JSON.stringify(before[k]??null)!==JSON.stringify(after[k]??null)).map(key=>({id:crypto.randomUUID(),key,value:after[key]??null}));}
export function materialize(ops:StoredOp[]){const values:Record<string,unknown>={},versions:Record<string,string[]>={};for(const op of [...ops].sort((a,b)=>a.seq-b.seq)){values[op.key]=op.value;if(op.key.startsWith('note:')&&typeof op.value==='string'&&op.value){const t=op.key.slice(5);versions[t]=[op.value,...(versions[t]??[]).filter(v=>v!==op.value)];}}return {values,versions};}
export function unpack(values:Record<string,unknown>){const terminal={version:1,watchlist:[] as string[],seen:[] as string[],notes:{} as Record<string,string>},interests={version:1,items:{} as Record<string,unknown>};for(const [key,v] of Object.entries(values)){const [kind,t]=key.split(':');if(v==null)continue;if(kind==='save'&&v===true)terminal.watchlist.push(t);if(kind==='seen'&&v===true)terminal.seen.push(t);if(kind==='note'&&typeof v==='string')terminal.notes[t]=v;if(kind==='interest')interests.items[t]=v;}return {terminal,interests};}
export function validOp(o:SyncOp){if(o&&typeof o.id==='string'&&/^[a-zA-Z0-9-]{10,80}$/.test(o.id)&&typeof o.key==='string'&&/^(legacyShelf|legacyCase):[A-Za-z0-9%_.-]{1,200}$/.test(o.key))return o.value===null||(typeof o.value==='object'&&JSON.stringify(o.value).length<=200000);if(!o||typeof o.id!=='string'||!/^[a-zA-Z0-9-]{10,80}$/.test(o.id)||typeof o.key!=='string'||!/^(save|seen|note|interest|legacySave):[A-Z][A-Z0-9.-]{0,11}$/.test(o.key))return false;if(o.value===null)return true;const kind=o.key.split(':')[0];if(kind==='save'||kind==='seen'||kind==='legacySave')return o.value===true;if(kind==='note')return typeof o.value==='string'&&o.value.length<=5000;return typeof o.value==='object'&&JSON.stringify(o.value).length<=3000;}
