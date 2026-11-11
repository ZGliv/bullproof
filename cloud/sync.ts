import {validOp,type SyncOp} from '../src/lib/device-sync';
interface Statement{bind(...v:unknown[]):Statement;first<T>():Promise<T|null>;all<T>():Promise<{results:T[]}>;run():Promise<unknown>}
interface DB{prepare(s:string):Statement;batch(s:Statement[]):Promise<unknown[]>}
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
const secret=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
export async function syncRequest(request:Request,db:DB){
 try{
 if(request.method!=='POST')return json({error:'POST required'},405);
 const text=await request.text();if(text.length>300000)return json({error:'Sync batch too large'},413);
 const body=JSON.parse(text);const action=new URL(request.url).pathname.split('/').at(-1);
 if(['create','join','recover'].includes(action!)){
 const bucket=await hash((request.headers.get('CF-Connecting-IP')??'proxy')+':'+Math.floor(Date.now()/3600000));
 const rate=await db.prepare('INSERT INTO sync_rate(bucket,n) VALUES(?,1) ON CONFLICT(bucket) DO UPDATE SET n=n+1 RETURNING n').bind(bucket).first<{n:number}>();if((rate?.n??999)>30)return json({error:'Too many pairing attempts. Try again in one hour.'},429);
 let account:string|undefined,recovery:string|undefined;
 if(action==='create'){account=crypto.randomUUID();recovery=secret();await db.prepare('INSERT INTO sync_accounts(id,recovery) VALUES(?,?)').bind(account,await hash(recovery)).run();}
 else if(action==='join'){if(typeof body.code!=='string'||!/^[a-f0-9]{20}$/.test(body.code.replaceAll('-','').toLowerCase()))return json({error:'Invalid or expired pairing code'},400);const row=await db.prepare('DELETE FROM sync_pairs WHERE code=? AND expires>? RETURNING account').bind(await hash(body.code.replaceAll('-','').toLowerCase()),Date.now()).first<{account:string}>();account=row?.account;}
 else if(typeof body.recovery==='string')account=(await db.prepare('SELECT id FROM sync_accounts WHERE recovery=?').bind(await hash(body.recovery.trim())).first<{id:string}>())?.id;
 if(!account)return json({error:'Invalid or expired connection credentials'},401);
 const token=secret();await db.prepare('INSERT INTO sync_devices(token,account) VALUES(?,?)').bind(await hash(token),account).run();return json({token,recovery});
 }
 const token=request.headers.get('Authorization')?.replace(/^Bearer /,'');if(!token||token.length!==64)return json({error:'Connect this device first'},401);
 const device=await db.prepare('SELECT account FROM sync_devices WHERE token=?').bind(await hash(token)).first<{account:string}>();if(!device)return json({error:'Device connection unavailable'},401);
 if(action==='pair'){const code=secret().slice(0,20);await db.batch([db.prepare('DELETE FROM sync_pairs WHERE account=? OR expires<?').bind(device.account,Date.now()),db.prepare('INSERT INTO sync_pairs(code,account,expires) VALUES(?,?,?)').bind(await hash(code),device.account,Date.now()+600000)]);return json({code:code.match(/.{1,5}/g)!.join('-'),expires:Date.now()+600000});}
 if(action==='exchange'){
 const ops=body.ops as SyncOp[];if(!Array.isArray(ops)||ops.length>100||ops.some(o=>!validOp(o)))return json({error:'Invalid sync changes; local data retained'},400);
 const count=ops.length?await db.prepare('SELECT COUNT(*) n FROM sync_ops WHERE account=?').bind(device.account).first<{n:number}>():null;if((count?.n??0)+ops.length>20000)return json({error:'Sync history limit reached. Local data is retained; export your history.'},409);
 if(ops.length)await db.batch(ops.map(o=>db.prepare('INSERT OR IGNORE INTO sync_ops(account,id,key,value) VALUES(?,?,?,?)').bind(device.account,o.id,o.key,JSON.stringify(o.value))));
 const after=Number.isSafeInteger(body.after)&&body.after>=0?body.after:0;
 const rows=await db.prepare('SELECT seq,id,key,value FROM sync_ops WHERE account=? AND seq>? ORDER BY seq').bind(device.account,after).all<{seq:number;id:string;key:string;value:string}>();return json({ops:rows.results.map(o=>({...o,value:JSON.parse(o.value)}))});
 }
 return json({error:'Unknown sync action'},404);
 }catch{return json({error:'Sync unavailable. Your local changes are retained.'},503);}
}
