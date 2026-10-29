const ZONE = "America/Chicago";
const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=120" };
function unfold(source) { return source.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n"); }
function unescapeText(s = "") { return s.replace(/\\n/gi,"\n").replace(/\\,/g,",").replace(/\\;/g,";").replace(/\\\\/g,"\\").trim(); }
function rawDate(s) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?Z?)?$/.exec(s || "");
  if (!m) return null;
  return { day: m[1]+"-"+m[2]+"-"+m[3], time:m[4] ? m[4]+":"+m[5] : "", utc: s.endsWith("Z"), allDay: !m[4] };
}
function dateFromDay(day) { return new Date(day+"T12:00:00Z"); }
function shiftDay(day, amount) { const d=dateFromDay(day); d.setUTCDate(d.getUTCDate()+amount); return d.toISOString().slice(0,10); }
function parseFeed(raw) {
  const lines=unfold(raw), events=[]; let current=null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { current={}; continue; }
    if (line === "END:VEVENT") { if(current) events.push(current); current=null; continue; }
    if (!current) continue;
    const colon=line.indexOf(":"); if(colon<0) continue;
    const key=line.slice(0,colon).split(";")[0].toUpperCase(), value=line.slice(colon+1);
    if (key === "EXDATE") current.EXDATE=[...(current.EXDATE||[]),...value.split(",").map(v=>rawDate(v)?.day).filter(Boolean)];
    else if (["UID","SUMMARY","DTSTART","DTEND","LOCATION","DESCRIPTION","RRULE","STATUS","RECURRENCE-ID"].includes(key)) current[key]=value;
  }
  return events;
}
function parseRule(s) {
  if(!s) return null; const result={};
  for(const part of s.split(";")) { const [k,v]=part.split("="); if(k) result[k]=v; }
  return result;
}
const WEEKDAYS={SU:0,MO:1,TU:2,WE:3,TH:4,FR:5,SA:6};
function matchRule(day, start, rule) {
  const interval=Math.max(1,Number(rule.INTERVAL)||1), date=dateFromDay(day), base=dateFromDay(start);
  const diff=Math.round((date-base)/86400000);
  if(diff<0) return false;
  const weekday=date.getUTCDay(), days=(rule.BYDAY||"").split(",").map(x=>WEEKDAYS[x.slice(-2)]).filter(v=>v!==undefined);
  if(rule.FREQ==="DAILY") return diff%interval===0 && (!days.length || days.includes(weekday));
  if(rule.FREQ==="WEEKLY") {
    const w=Math.floor((diff+(base.getUTCDay()+6)%7)/7);
    return w%interval===0 && (days.length?days.includes(weekday):weekday===base.getUTCDay());
  }
  const months=(date.getUTCFullYear()-base.getUTCFullYear())*12 + date.getUTCMonth()-base.getUTCMonth();
  if(rule.FREQ==="MONTHLY") return months>=0 && months%interval===0 && date.getUTCDate()===base.getUTCDate();
  if(rule.FREQ==="YEARLY") return date.getUTCFullYear()>=base.getUTCFullYear() && (date.getUTCFullYear()-base.getUTCFullYear())%interval===0 && date.getUTCMonth()===base.getUTCMonth() && date.getUTCDate()===base.getUTCDate();
  return false;
}
function formatTime(time) {
  if(!time) return "All day"; const [h,m]=time.split(":").map(Number);
  return (h%12||12)+":"+String(m).padStart(2,"0")+(h>=12?" PM":" AM");
}
function generate(items) {
  const now=new Date(), today=new Intl.DateTimeFormat("en-CA",{timeZone:ZONE,year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
  // Rolling 120-day upcoming window; simple recurrence rules.
  const max=shiftDay(today,120), out=[], overrides=new Set();
  for(const item of items) if(item["RECURRENCE-ID"]) overrides.add(item.UID+"|"+rawDate(item["RECURRENCE-ID"])?.day);
  for(const item of items) {
    if(item.STATUS==="CANCELLED") continue;
    const start=rawDate(item.DTSTART); if(!start) continue;
    const rule=parseRule(item.RRULE);
    const until=rule?.UNTIL ? rawDate(rule.UNTIL)?.day : null;
    const dates=[];
    if(!rule || item["RECURRENCE-ID"]) dates.push(start.day);
    else {
      let count=0;
      // To honor COUNT, walk from original start, bounded at 4 years.
      const end=rule.COUNT ? shiftDay(start.day,1460) : max;
      for(let day=start.day;day<=end && day<=max;day=shiftDay(day,1)) {
        if(until && day>until) break;
        if(matchRule(day,start.day,rule)) { count++; if(day>=today) dates.push(day); if(rule.COUNT && count>=Number(rule.COUNT)) break; }
      }
    }
    for(const day of dates) {
      if(day<today || day>max || item.EXDATE?.includes(day) || (!item["RECURRENCE-ID"] && overrides.has(item.UID+"|"+day))) continue;
      out.push({id:(item.UID||item.SUMMARY||"event")+"|"+day,title:unescapeText(item.SUMMARY||"Church Event"),
        date:day,time:formatTime(start.time), location:unescapeText(item.LOCATION||""),
        description:unescapeText(item.DESCRIPTION||"").slice(0,1200),allDay:start.allDay});
    }
  }
  return out.sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)).slice(0,100);
}
export default async () => {
  const feed=Netlify.env.get("ICBC_CALENDAR_ICS_URL") || process.env.ICBC_CALENDAR_ICS_URL;
  if(!feed) return new Response(JSON.stringify({error:"Church calendar feed is not configured on the website."}),{status:503,headers});
  try {
    const url=new URL(feed.replace(/^webcal:/i,"https:"));
    if(url.protocol!=="https:" || url.hostname!=="calendar.planningcenteronline.com") throw new Error("Unexpected calendar feed host.");
    const response=await fetch(url,{signal:AbortSignal.timeout(10000),headers:{Accept:"text/calendar"},cache:"no-store"});
    if(!response.ok) throw new Error("Calendar source returned "+response.status);
    const body=await response.text();
    if(!body.includes("BEGIN:VCALENDAR")) throw new Error("Calendar feed response was invalid.");
    return new Response(JSON.stringify({events:generate(parseFeed(body))}),{headers});
  } catch(error) { console.error("Church calendar error",error); return new Response(JSON.stringify({error:"Unable to load church events right now."}),{status:502,headers}); }
};