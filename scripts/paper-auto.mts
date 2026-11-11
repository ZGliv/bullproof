/** One bounded scheduled tick. Scheduling belongs to the Codex heartbeat. */
import {access,readFile,writeFile,mkdir,rename,open,unlink,cp,stat} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {marketDay,dailyResearchComplete,publishAllowed,clockIsFresh} from '../src/lib/paper/schedule.ts';
import type {Ledger} from '../src/lib/paper/engine.ts';
const root=resolve(fileURLToPath(new URL('..',import.meta.url))),dir=resolve(root,'.paper'),release=resolve(dir,'release');
try{await access(resolve(dir,'cloud-authoritative'));console.log('Local runner retired: Cloudflare now owns the portfolio ledger.');process.exit(0);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
const flags=new Set(process.argv.slice(2));
const config={schedule:'Weekdays, every 30 minutes from 9:05 a.m. to 4:35 p.m. Eastern; execution only while Alpaca reports the regular session open',model:'qwen3:8b',runner:'Codex heartbeat on this Mac',requires:'Mac awake, online, Codex available, Ollama running',inference:'Once per trading day; maximum 3 attempts per day',publication:'At most one production update per 29 minutes and 15 per day; fixed approved source bundle'};
type State={day:string;publishCount:number;lastPublishAt:number;researchAttempts:number;enabled:boolean;marketOpen?:boolean;lastCheckAt?:string;nextOpen?:string;lastOutcome?:string;lastPublishedAt?:string};
await mkdir(dir,{recursive:true});
const stateFile=resolve(dir,'automation.json');
const atomic=async(path:string,data:unknown)=>{await writeFile(path+'.tmp',JSON.stringify(data,null,2)+'\n',{mode:0o600});await rename(path+'.tmp',path);};
let lock;
try{lock=await open(resolve(dir,'auto.lock'),'wx');await lock.writeFile(String(process.pid));}catch{console.log('Another automatic tick is active; skipped.');process.exit(0);}
let state:State={day:marketDay(new Date()),publishCount:0,lastPublishAt:0,researchAttempts:0,enabled:false};
const run=async(command:string,args:string[],cwd:string,timeout:number)=>new Promise<void>((ok,fail)=>{
 const env={...process.env};delete env.APCA_API_KEY_ID;delete env.APCA_API_SECRET_KEY;
 const child=spawn(command,args,{cwd,env,stdio:['ignore','pipe','pipe']});let output='';
 child.stdout.on('data',b=>{output=(output+b.toString()).slice(-50000);});child.stderr.on('data',b=>{output=(output+b.toString()).slice(-50000);});
 const timer=setTimeout(()=>child.kill('SIGTERM'),timeout);
 child.on('error',()=>{clearTimeout(timer);fail(new Error('Could not start local command'));});
 child.on('close',async code=>{clearTimeout(timer);await writeFile(resolve(dir,'last-command.log'),output,{mode:0o600});if(code===0)ok();else fail(new Error(`Local ${basename(command)} command failed (${code??'timeout'}); inspect .paper/last-command.log locally`));});
});
async function snapshotStatus(){
 const path=resolve(root,'public/data/paper-arena.json');const snapshot=JSON.parse(await readFile(path,'utf8'));
 snapshot.automation={...config,...state};
 snapshot.execution=snapshot.execution.replace('Runs are manual on this Mac; website shows the last published run.','Scheduled on this Mac during market hours; website shows the last successful publication.');
 await atomic(path,snapshot);
}
try{
 try{state=JSON.parse(await readFile(stateFile,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 const day=marketDay(new Date());if(state.day!==day)state={...state,day,publishCount:0,researchAttempts:0};
 if(flags.has('--freeze')){
  // Only approved source files are copied. Future scheduled publishes never deploy work-in-progress edits.
  const names=['src','public','scripts','package.json','package-lock.json','next.config.ts','next.config.mjs','next-env.d.ts','tsconfig.json','eslint.config.mjs','postcss.config.mjs','vercel.json','.vercelignore'];
  await mkdir(release,{recursive:true});
  for(const name of names){const p=resolve(root,name);try{await stat(p);await cp(p,resolve(release,name),{recursive:true,force:true,filter:p=>!basename(p).startsWith('.env')});}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
  await mkdir(resolve(release,'.vercel'),{recursive:true});await cp(resolve(root,'.vercel/project.json'),resolve(release,'.vercel/project.json'));
  console.log('Approved release bundle captured; scheduled publishing is isolated from ongoing source edits.');
 }
 if(flags.has('--enable'))state.enabled=true;
 if(flags.has('--disable'))state.enabled=false;
 process.loadEnvFile(resolve(root,'.env.paper.local'));
 const key=process.env.APCA_API_KEY_ID,secret=process.env.APCA_API_SECRET_KEY;
 if(!key||!secret)throw new Error('Paper credentials are missing');
 const r=await fetch('https://paper-api.alpaca.markets/v2/clock',{headers:{'APCA-API-KEY-ID':key,'APCA-API-SECRET-KEY':secret},signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw new Error(`Alpaca clock failed (${r.status})`);
 const clock=await r.json();if(!clockIsFresh(clock.timestamp,Date.now()))throw new Error('Alpaca clock is stale');
 state.lastCheckAt=new Date().toISOString();state.nextOpen=clock.next_open;
 let changed=flags.has('--publish-status')||(state.enabled&&state.marketOpen===true&&clock.is_open===false);
 state.marketOpen=clock.is_open===true;
 if(state.enabled&&clock.is_open&&!flags.has('--publish-status')){
  const ledger=JSON.parse(await readFile(resolve(dir,'ledger.json'),'utf8')) as Ledger;
  const complete=dailyResearchComplete(ledger,day);
  if(!complete){if(state.researchAttempts>=3)throw new Error('Daily research retry cap reached; no older-day orders executed');state.researchAttempts++;await atomic(stateFile,state);}
  await run(process.execPath,['scripts/paper-runner.mts',complete?'--execute-only':'--execute'],root,12*60*1000);
  state.lastOutcome='Market-hours research/execution/valuation pass completed. Inspect the ledger for fills or quote blocks.';changed=true;
 }else state.lastOutcome=state.enabled?'Market closed; no inference or execution attempted.':'Automation disabled.';
 await atomic(stateFile,state);await snapshotStatus();
 if(changed){
  if(!publishAllowed(Date.now(),state.lastPublishAt,state.publishCount))console.log('Publication deferred by free-usage cap; local ledger preserved.');
  else{
   await stat(resolve(release,'package.json'));
   const link=JSON.parse(await readFile(resolve(release,'.vercel/project.json'),'utf8'));
   if(link.projectId!=='prj_68lrxSvOTvpfofa0FJXPihHlCWBU'||link.orgId!=='team_NM5p3BbkWQgVAHTWuXrxLZCx')throw new Error('Unexpected deployment target');
   state.publishCount++;state.lastPublishAt=Date.now();await atomic(stateFile,state);await snapshotStatus();
   await cp(resolve(root,'public/data/paper-arena.json'),resolve(release,'public/data/paper-arena.json'));
   await run('/Users/Test/.npm/_npx/10734421d84da640/node_modules/.bin/vercel',['deploy','--prod','--yes','--scope',link.orgId],release,10*60*1000);
   const response=await fetch(`https://bullproof.vercel.app/data/paper-arena.json?check=${Date.now()}`,{signal:AbortSignal.timeout(20000),cache:'no-store'});if(!response.ok)throw new Error('Published snapshot could not be verified');const published=await response.json();
   if(published.automation?.lastCheckAt!==state.lastCheckAt)throw new Error('Production snapshot does not match this tick');
   state.lastPublishedAt=new Date().toISOString();await atomic(stateFile,state);console.log('Production snapshot verified.');
  }
 }
 console.log(JSON.stringify({enabled:state.enabled,marketOpen:clock.is_open,nextOpen:state.nextOpen,outcome:state.lastOutcome,publishedAt:state.lastPublishedAt}));
}catch(e){state.lastOutcome=e instanceof Error?e.message:'Automatic tick failed';await atomic(stateFile,state);try{await snapshotStatus();}catch{}console.error(state.lastOutcome);process.exitCode=1;}
finally{await lock.close();await unlink(resolve(dir,'auto.lock'));}
