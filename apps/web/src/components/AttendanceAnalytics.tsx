'use client';
import { useEffect, useState } from 'react';
import { fetchApi } from '../lib/api';

function Bars({ rows }: { rows: {label: string; value: number}[] }) {
  const max = Math.max(1, ...rows.map(row => row.value));
  return <div className="space-y-3">{rows.map(row => <div key={row.label}>
    <div className="flex justify-between gap-3 text-sm"><span>{row.label}</span><strong>{row.value}</strong></div>
    <div className="h-3 rounded bg-slate-800 mt-1"><div className="h-3 rounded bg-indigo-400" style={{width:`${row.value / max * 100}%`}} /></div>
  </div>)}</div>;
}
export function AttendanceAnalytics() {
  const [filters,setFilters] = useState({memberId:'',subTeamId:'',categoryId:''});
  const [options,setOptions] = useState<any>(null);
  useEffect(()=>{fetchApi('/reports/filter-options').then(setOptions).catch(()=>{});},[]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [days, setDays] = useState(30);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let current = true;
    setData(null); setError('');
    fetchApi(`/reports/analytics?${new URLSearchParams({days:String(days),...Object.fromEntries(Object.entries(filters).filter(([,v])=>v)),...(from ? {from} : {}),...(to ? {to} : {})})}`).then(result => {if(current) setData(result);}).catch(err => {if(current) setError(err.message);});
    return () => {current = false;};
  }, [days, version, from, to, filters]);
  const rate = (value: number | null) => value === null ? 'No data' : `${value}%`;
  return <section className="space-y-5" aria-label="Attendance analytics">
    <div className="flex flex-wrap gap-4 items-center justify-between">
      <h2 className="text-xl font-bold">Attendance analytics</h2>
      <label>Reporting period <select className="bg-slate-800 rounded p-2" value={days} onChange={e => setDays(Number(e.target.value))}>
        {[7,30,90,365].map(n => <option key={n} value={n}>Last {n} days</option>)}
      </select></label>
      {options && <>{(['categoryId','subTeamId','memberId'] as const).map(key => <label key={key}>{key==='categoryId'?'Category':key==='subTeamId'?'Sub-team':'Member'}<select value={filters[key]} onChange={e=>setFilters({...filters,[key]:e.target.value})} className="block bg-slate-800 p-2 rounded"><option value="">All</option>{(key==='categoryId'?options.categories:key==='subTeamId'?options.teams:options.members).map((item:any)=><option key={item.id} value={item.id}>{item.name || `${item.firstName} ${item.lastName}`}</option>)}</select></label>)}</>}
      <label>From<input type="date" className="block bg-slate-800 rounded p-2" value={from} onChange={e=>setFrom(e.target.value)}/></label>
      <label>To<input type="date" className="block bg-slate-800 rounded p-2" value={to} onChange={e=>setTo(e.target.value)}/></label>
      <button className="underline" onClick={() => {setFrom('');setTo('');}}>Clear dates</button>
      <button className="underline" onClick={() => setVersion(v => v+1)}>Refresh analytics</button>
    </div>
    {error ? <p role="alert">{error}</p> : !data ? <p role="status">Loading analytics…</p> : <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[['Completed services',data.services.length],['Attendance rate',rate(data.attendanceRate)],['Punctuality rate',rate(data.punctualityRate)],['Active members (current)',data.members.ACTIVE || 0]].map(([label,value]) => <div key={label} className="rounded-xl bg-slate-900 border border-slate-800 p-4"><p className="text-sm text-slate-400">{label}</p><p className="text-2xl font-bold">{value}</p></div>)}
      </div>
      <p className="text-sm text-slate-400">Attendance = present ÷ (present + absent) records from completed services. Excused and exempt records are excluded. Punctuality = early or on-time ÷ present. Counts represent service attendances, not unique people.</p>
      {!data.services.length && <p>No completed services in this period.</p>}
      <div className="grid md:grid-cols-2 gap-5">
        <section className="bg-slate-900 rounded-xl p-5 space-y-4"><h3 className="font-bold">Attendance breakdown</h3><Bars rows={['EARLY','ON_TIME','GRACE_PERIOD','LATE','ABSENT','EXCUSED','EXEMPT'].map(status => ({label:status.replaceAll('_',' '),value:data.statuses[status] || 0}))}/></section>
        <section className="bg-slate-900 rounded-xl p-5 space-y-4"><h3 className="font-bold">Present by service category</h3>{data.categories.length ? <Bars rows={data.categories.map((c:any) => ({label:c.name,value:c.attended}))}/> : <p>No data</p>}</section>
        <section className="bg-slate-900 rounded-xl p-5 space-y-4"><h3 className="font-bold">Event RSVPs</h3><Bars rows={[{label:'Attending',value:data.responses.attending},{label:'Not attending',value:data.responses.notAttending}]}/><p className="text-sm text-slate-400">Submitted responses for events starting in the selected period; these are not check-ins.</p></section>
        <section className="bg-slate-900 rounded-xl p-5 space-y-4"><h3 className="font-bold">Absence requests</h3><Bars rows={['PENDING','APPROVED','REJECTED'].map(status => ({label:status,value:data.excuses[status] || 0}))}/><p className="text-sm text-slate-400">Current decisions for events starting in the selected period.</p></section>
      </div>
      <section className="bg-slate-900 rounded-xl p-5 space-y-4"><h3 className="font-bold">Attendance over time</h3>
        {data.services.length ? <div className="overflow-x-auto"><div className="flex items-end gap-2 h-44" style={{minWidth:Math.max(300,data.services.length*45)}}>{data.services.map((s:any) => <div key={s.id} className="flex-1 h-full flex flex-col justify-end items-center" title={`${s.title}: ${s.attended} present, ${s.absent} absent`}>
          <span className="text-xs">{s.attended}</span><div className="bg-indigo-400 w-6 rounded-t" style={{height:`${s.attended / Math.max(1,...data.services.map((m:any)=>m.attended))*120}px`}}/><span className="text-xs mt-2">{new Date(s.date).toLocaleDateString('en-GB',{day:'2-digit',month:'short',timeZone:'Africa/Lagos'})}</span>
        </div>)}</div></div> : <p>No data</p>}
        <div className="overflow-x-auto"><table className="w-full text-sm text-left"><caption className="text-left mb-2">Service attendance details</caption><thead><tr>{['Service','Date (Lagos)','Present','Absent','Excused'].map(h=><th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{data.services.map((s:any)=><tr key={s.id} className="border-t border-slate-800"><td className="p-2">{s.title}</td><td className="p-2">{new Date(s.date).toLocaleString('en-GB',{timeZone:'Africa/Lagos'})}</td><td className="p-2">{s.attended}</td><td className="p-2">{s.absent}</td><td className="p-2">{s.excused}</td></tr>)}</tbody></table></div>
      </section>
    </>}
  </section>;
}
