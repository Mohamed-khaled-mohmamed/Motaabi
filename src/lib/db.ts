import Dexie, { type Table } from 'dexie';

export interface CachedHalqa {
  id: string;
  name: string;
  settings: any;
  created_by?: string;
  last_fetched: number;
}

export interface CachedStudent {
  id: string;
  halqa_id: string;
  name: string;
  parent_phone: string;
  gender: 'male' | 'female';
}

export interface CachedAttendance {
  id?: string; // local or server id
  student_id: string;
  halqa_id: string;
  date: string;
  status: 'present' | 'absent' | 'excused';
}

export interface SyncAction {
  id?: number;
  type: 'UPDATE_ATTENDANCE';
  payload: any;
  timestamp: number;
}

export class MotaabiDB extends Dexie {
  halqas!: Table<CachedHalqa>;
  students!: Table<CachedStudent>;
  attendance!: Table<CachedAttendance>;
  syncQueue!: Table<SyncAction>;

  constructor() {
    super('MotaabiDB');
    this.version(1).stores({
      halqas: 'id',
      students: 'id, halqa_id',
      attendance: '[student_id+date], halqa_id',
      syncQueue: '++id, timestamp'
    });
  }
}

export const db = new MotaabiDB();
