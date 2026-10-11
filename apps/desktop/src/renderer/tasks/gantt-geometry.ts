import {shiftDates,addDays,inclusiveDays} from '../../../../../packages/core/src/dates';import type {DateOnly} from '../../../../../packages/core/src/model';
export type DateRange={start:DateOnly;end:DateOnly};
export function moveRange(start:DateOnly,end:DateOnly,deltaDays:number):DateRange{return shiftDates(start,end,deltaDays);}
export function resizeRange(start:DateOnly,end:DateOnly,edge:'start'|'end',deltaDays:number):DateRange{const range={start:edge==='start'?addDays(start,deltaDays):start,end:edge==='end'?addDays(end,deltaDays):end};inclusiveDays(range.start,range.end);return range;}
