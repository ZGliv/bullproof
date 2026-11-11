import type {Ledger} from './engine';
export function marketDay(date:Date){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
export function dailyResearchComplete(ledger:Ledger,day:string){return ['growth','quality','turnaround','rules','spy'].every(id=>ledger.decisions.some(d=>d.strategy===id&&d.day===day&&d.version==='v2'));}
export function publishAllowed(at:number,lastAt:number,count:number){return count<15&&(!lastAt||at-lastAt>=29*60*1000);}
export function clockIsFresh(timestamp:string,now:number){return Number.isFinite(Date.parse(timestamp))&&Math.abs(now-Date.parse(timestamp))<60000;}
