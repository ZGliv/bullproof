import {validDay,resolveEarnings,type EarningsEvent,type CompanyCatalysts} from './catalysts';
export type CalendarRow={ticker?:unknown;date?:unknown;status?:unknown;basis?:unknown};
export function calendarEstimate(row:CalendarRow|undefined,ticker:string,today:string):EarningsEvent|null {
 if(!row||row.ticker!==ticker||row.status!=='estimated'||!validDay(row.date)||row.date<today||Date.parse(row.date)-Date.parse(today)>120*86400000)return null;
 return {date:row.date,status:'estimated',basis:validDay(row.basis)?row.basis:null,source:'XOOMAR · SEC-based estimate',url:`https://xoomar.com/markets/stocks/${ticker.toLowerCase()}`};
}

export function recoverCalendar(company:CompanyCatalysts,response:{data?:{ticker?:string;next?:CalendarRow};updatedAt?:string},now=Date.now()):CompanyCatalysts {
 if(response.data?.ticker!==company.ticker)throw new Error('Calendar symbol mismatch');
 const today=new Date(now).toLocaleDateString('en-CA',{timeZone:'America/New_York'});
 const estimate=calendarEstimate({...response.data.next,ticker:company.ticker},company.ticker,today);
 const raw=company.news.map(n=>({headline:n.headline,url:n.url,source:n.source,created_at:n.publishedAt,symbols:[company.ticker]}));
 const resolved=resolveEarnings(estimate,raw,company.ticker,now,response.updatedAt);
 const changed=company.warnings.some(w=>w.includes('schedule change'));
 return {...company,earnings:changed?null:company.earnings?.status==='reported-schedule'?company.earnings:resolved.earnings,calendarStatus:'ok',calendarUpdatedAt:response.updatedAt??null,warnings:[...company.warnings.filter(w=>!w.startsWith('Earnings calendar is temporarily unavailable')), ...resolved.warnings].filter((w,i,a)=>a.indexOf(w)===i)};
}
