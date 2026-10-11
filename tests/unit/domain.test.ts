import { describe, it, expect } from 'vitest';
import { parseDateOnly, inclusiveDays, shiftDates, todayKorea } from '../../packages/core/src/dates';
import { summarizeProgress } from '../../packages/core/src/progress';
import { taskFieldsSchema } from '../../packages/core/src/contracts';
import type { Task } from '../../packages/core/src/model';
describe('calendar dates',()=>{
 it('includes both endpoints over leap day and preserves duration across year end',()=>{
 expect(inclusiveDays('2028-02-29','2028-02-29')).toBe(1);
 expect(inclusiveDays('2028-02-28','2028-03-01')).toBe(3);
 expect(shiftDates('2027-12-31','2028-01-02',1)).toEqual({start:'2028-01-01',end:'2028-01-03'});
 });
 it.each(['2027-02-29','2028-02-30','2028-2-01','0000-01-01','2028-01-01T00:00:00Z'])('rejects invalid %s',v=>expect(()=>parseDateOnly(v)).toThrow());
 it('rejects reverse intervals and fractional shifts',()=>{expect(()=>inclusiveDays('2028-03-01','2028-02-28')).toThrow();expect(()=>shiftDates('2028-01-01','2028-01-02',.5)).toThrow()});
 it('uses Korea midnight independently of OS time zone',()=>{expect(todayKorea(new Date('2028-02-28T14:59:59Z'))).toBe('2028-02-28');expect(todayKorea(new Date('2028-02-28T15:00:00Z'))).toBe('2028-02-29')});
});
describe('task validation and progress',()=>{
 const fields={name:' 작업 ',start:null,end:null,progress:null};
 it('preserves null and trims names',()=>expect(taskFieldsSchema.parse(fields)).toEqual({...fields,name:'작업'}));
 it.each([{start:'2028-01-01'}, {start:'2028-03-01',end:'2028-02-28'}, {progress:101},{progress:1.5},{progress:-1},{name:'  '}])('rejects invalid fields %j',patch=>expect(taskFieldsSchema.safeParse({...fields,...patch}).success).toBe(false));
 const tasks=(values:(number|null)[])=>values.map(progress=>({progress,deletedAt:null} as Task));
 it('does not coerce missing progress to zero or infer completion from dates',()=>{expect(summarizeProgress(tasks([0,null]))).toEqual({value:null,entered:1,total:2});expect(summarizeProgress(tasks([0,100]))).toEqual({value:50,entered:2,total:2});expect(summarizeProgress([])).toEqual({value:null,entered:0,total:0});expect(summarizeProgress([...tasks([0]),{progress:100,deletedAt:'2020-01-01'} as Task])).toEqual({value:0,entered:1,total:1})});
});
