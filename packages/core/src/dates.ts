import type { DateOnly } from './model';
const DAY=86_400_000;
export function parseDateOnly(value:string):DateOnly {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'0001-01-01') throw new Error('올바른 날짜가 필요합니다');
 const ms=Date.parse(value+'T00:00:00.000Z');
 if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==value) throw new Error('올바른 날짜가 필요합니다');
 return value;
}
export function dateNumber(value:DateOnly):number { return Date.parse(parseDateOnly(value)+'T00:00:00.000Z')/DAY; }
export function addDays(value:DateOnly,delta:number):DateOnly {
 if(!Number.isSafeInteger(delta))throw new Error('날짜 이동은 정수입니다');
 return parseDateOnly(new Date((dateNumber(value)+delta)*DAY).toISOString().slice(0,10));
}
export function inclusiveDays(start:DateOnly,end:DateOnly):number { const n=dateNumber(end)-dateNumber(start)+1;if(n<1)throw new Error('종료일은 시작일 이후여야 합니다');return n; }
export function shiftDates(start:DateOnly,end:DateOnly,deltaDays:number){inclusiveDays(start,end);return {start:addDays(start,deltaDays),end:addDays(end,deltaDays)};}
export function todayKorea(now:Date):DateOnly {return parseDateOnly(new Date(now.getTime()+9*3_600_000).toISOString().slice(0,10));}
