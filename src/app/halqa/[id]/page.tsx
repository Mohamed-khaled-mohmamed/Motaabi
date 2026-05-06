"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO, subDays } from "date-fns";
import { ar } from "date-fns/locale";
import { 
  User, Calendar, CheckCircle2, XCircle, Info, Plus, Phone, Trash2, Edit3,
  ChevronRight, ChevronLeft, Target, AlertTriangle, Settings, Filter, Users, Palmtree, ArrowRight, Loader2, Mail, Wifi, WifiOff, RefreshCw, LayoutGrid, BarChart3, PieChart, FileJson, Zap, ZapOff
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { supabase } from "@/lib/supabase";
import { db } from "@/lib/db";
import { useOfflineSync } from "@/hooks/useOfflineSync";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface Student {
  id: string;
  name: string;
  parent_phone: string;
  notes: string;
  gender: 'male' | 'female';
}

export default function HalqaPage() {
  const { id: halqaId } = useParams();
  const router = useRouter();
  const { isOnline, isSyncing, queueAction } = useOfflineSync();

  // --- State ---
  const [activeTab, setActiveTab] = useState<'attendance' | 'reports' | 'stats'>('attendance');
  const [isFastMode, setIsFastMode] = useState(false);
  const [halqaName, setHalqaName] = useState("");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isBulkAddOpen, setIsBulkAddOpen] = useState(false);
  const [bulkJson, setBulkJson] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editStudent, setEditStudent] = useState<Student | null>(null);
  
  const [absenceThreshold, setAbsenceThreshold] = useState(3);
  const [weekendDays, setWeekendDays] = useState<number[]>([5, 6]);
  const [newStudent, setNewStudent] = useState({ name: "", parent_phone: "", notes: "", gender: 'male' as 'male' | 'female' });
  const [inviteEmail, setInviteEmail] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [genderFilter, setGenderFilter] = useState<"all" | "male" | "female">("all");
  const [attendanceFilter, setAttendanceFilter] = useState<'all' | 'present' | 'absent'>('all');
  const [isStatsVisible, setIsStatsVisible] = useState(true);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLTableHeaderCellElement>(null);
  const timelineRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const touchStartPos = useRef<{ x: number, y: number } | null>(null);
  const longPressTimer = useRef<any>(null);

  // --- Helpers ---
  const isHoliday = (date: Date | string) => {
    const d = typeof date === 'string' ? parseISO(date) : date;
    return weekendDays.includes(d.getDay());
  };

  const getFilteredAbsenceCount = (studentId: string, targetMonth?: Date) => {
    return Object.keys(attendance).filter(key => {
      if (!key.startsWith(`${studentId}-`)) return false;
      if (attendance[key] !== 'absent') return false;
      const dateStr = key.replace(`${studentId}-`, "");
      if (targetMonth && !dateStr.startsWith(format(targetMonth, "yyyy-MM"))) return false;
      if (isHoliday(dateStr)) return false;
      return true;
    }).length;
  };

  const days = useMemo(() => eachDayOfInterval({ 
    start: startOfMonth(currentDate), 
    end: endOfMonth(currentDate) 
  }), [currentDate]);

  const workingDaysOfMonth = useMemo(() => days.filter(d => !isHoliday(d)), [days, weekendDays]);

  // --- Fetch Data ---
  useEffect(() => { if (halqaId) fetchData(); }, [halqaId, currentDate, isOnline]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const cachedHalqa = await db.halqas.get(halqaId as string);
      if (cachedHalqa) {
        setHalqaName(cachedHalqa.name);
        setAbsenceThreshold(cachedHalqa.settings?.absence_threshold || 3);
        setWeekendDays(cachedHalqa.settings?.weekend_days || [5, 6]);
      }
      const cachedStudents = await db.students.where('halqa_id').equals(halqaId as string).toArray();
      if (cachedStudents.length > 0) setStudents(cachedStudents as any);
      const cachedAttendance = await db.attendance.where('halqa_id').equals(halqaId as string).toArray();
      const attMap: Record<string, any> = {};
      cachedAttendance.forEach(r => attMap[`${r.student_id}-${r.date}`] = r.status);
      setAttendance(attMap);

      if (isOnline) {
        const { data: halqa } = await supabase.from("halqas").select("*").eq("id", halqaId).single();
        if (halqa) {
          setHalqaName(halqa.name);
          setAbsenceThreshold(halqa.settings?.absence_threshold || 3);
          setWeekendDays(halqa.settings?.weekend_days || [5, 6]);
          await db.halqas.put({ id: halqa.id, name: halqa.name, settings: halqa.settings, last_fetched: Date.now() });
        }
        const { data: sData } = await supabase.from("students").select("*").eq("halqa_id", halqaId).order("name");
        if (sData) { setStudents(sData); await db.students.bulkPut(sData); }
        const { data: aData } = await supabase.from("attendance").select("*").eq("halqa_id", halqaId);
        if (aData) {
          const freshMap: Record<string, any> = {};
          aData.forEach(r => freshMap[`${r.student_id}-${r.date}`] = r.status);
          setAttendance(freshMap);
          await db.attendance.where('halqa_id').equals(halqaId as string).delete();
          await db.attendance.bulkPut(aData.map(r => ({ student_id: r.student_id, halqa_id: r.halqa_id, date: r.date, status: r.status })));
        }
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleToggle = async (studentId: string, date: Date, forceType?: 'absent' | 'excused') => {
    if (isHoliday(date)) return;
    const dateStr = format(date, "yyyy-MM-dd");
    const key = `${studentId}-${dateStr}`;
    const currentStatus = attendance[key];
    
    let newStatus;
    if (forceType) {
      newStatus = currentStatus === forceType ? 'present' : forceType;
    } else {
      if (!currentStatus || currentStatus === 'absent' || currentStatus === 'excused') newStatus = 'present';
      else newStatus = 'absent';
    }

    await queueAction('UPDATE_ATTENDANCE', { halqa_id: halqaId, student_id: studentId, date: dateStr, status: newStatus });
    setAttendance(prev => ({ ...prev, [key]: newStatus }));
  };

  // --- SMART TOUCH & LONG PRESS LOGIC ---
  const handleStart = (e: any, sId: string, date: Date) => {
    const p = e.touches ? e.touches[0] : e;
    touchStartPos.current = { x: p.clientX, y: p.clientY };

    longPressTimer.current = setTimeout(() => {
      handleToggle(sId, date, 'excused'); // Long press = Excused
      longPressTimer.current = null;
      if (navigator.vibrate) navigator.vibrate(40);
    }, 600);
  };

  const handleEnd = (e: any, sId: string, date: Date) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
      
      const p = e.changedTouches ? e.changedTouches[0] : e;
      if (touchStartPos.current) {
        const dx = Math.abs(p.clientX - touchStartPos.current.x);
        const dy = Math.abs(p.clientY - touchStartPos.current.y);
        if (dx < 10 && dy < 10) handleToggle(sId, date); // Short click = toggle
      }
    }
    touchStartPos.current = null;
  };

  const saveSettings = async () => {
    try {
      const newSettings = { absence_threshold: Number(absenceThreshold), weekend_days: weekendDays };
      const { error } = await supabase.from("halqas").update({ settings: newSettings }).eq("id", halqaId);
      if (error) throw error;
      await db.halqas.update(halqaId as string, { settings: newSettings });
      setIsSettingsOpen(false);
      alert("تم الحفظ بنجاح");
      fetchData();
    } catch (e: any) { alert("خطأ في الحفظ: " + e.message); }
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data, error } = await supabase.from("students").insert([{ ...newStudent, halqa_id: halqaId }]).select().single();
    if (!error) { await db.students.put(data); setStudents([...students, data]); setIsAddModalOpen(false); setNewStudent({ name: "", parent_phone: "", notes: "", gender: 'male' }); }
  };

  const handleBulkAdd = async () => {
    try {
      const list = JSON.parse(bulkJson);
      const formatted = list.map((s: any) => ({ ...s, halqa_id: halqaId }));
      const { data, error } = await supabase.from("students").insert(formatted).select();
      if (error) throw error;
      if (data) { await db.students.bulkPut(data); setStudents([...students, ...data]); setIsBulkAddOpen(false); setBulkJson(""); }
    } catch (e: any) { alert("JSON Error: " + e.message); }
  };

  const handleUpdateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editStudent) return;
    const { error } = await supabase.from("students").update(editStudent).eq("id", editStudent.id);
    if (!error) { await db.students.put(editStudent as any); setStudents(students.map(s => s.id === editStudent.id ? editStudent : s)); setSelectedStudent(editStudent); setIsEditing(false); }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("invitations").insert([{ halqa_id: halqaId, email: inviteEmail.toLowerCase().trim(), role: 'editor', invited_by: user?.id }]);
    if (!error) { alert("تم إرسال الدعوة"); setIsInviteModalOpen(false); setInviteEmail(""); }
  };

  const scrollToToday = () => {
    if (todayRef.current && scrollContainerRef.current) {
      const scrollPos = todayRef.current.offsetLeft - scrollContainerRef.current.offsetWidth / 2 + todayRef.current.offsetWidth / 2;
      scrollContainerRef.current.scrollTo({ left: scrollPos, behavior: "smooth" });
    }
  };

  // --- Derived ---
  const filteredStudents = useMemo(() => students.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.parent_phone?.includes(searchQuery);
    const matchesGender = genderFilter === "all" || s.gender === genderFilter;
    const todayStrLocal = format(new Date(), "yyyy-MM-dd");
    const status = attendance[`${s.id}-${todayStrLocal}`];
    let matchesAtt = true;
    if (attendanceFilter === 'present') matchesAtt = (status === 'present');
    if (attendanceFilter === 'absent') matchesAtt = (status === 'absent');
    return matchesSearch && matchesGender && matchesAtt;
  }), [students, searchQuery, genderFilter, attendanceFilter, attendance, weekendDays]);

  const studentsWithWarnings = useMemo(() => students.filter(s => getFilteredAbsenceCount(s.id, currentDate) >= absenceThreshold), [students, attendance, absenceThreshold, currentDate, weekendDays]);

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const isTodayHoliday = isHoliday(new Date());
  const absentToday = students.filter(s => attendance[`${s.id}-${todayStr}`] === 'absent' && !isTodayHoliday);
  const presentTodayCount = students.filter(s => attendance[`${s.id}-${todayStr}`] === 'present' && !isTodayHoliday).length;

  if (loading && students.length === 0) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-blue-600" size={48} /></div>;

  return (
    <div className="min-h-screen bg-[#f8fafc] pb-24 md:pb-10 font-sans text-slate-900" dir="rtl">
      {/* Banners */}
      {isSyncing && <div className="bg-blue-600 text-white py-2 text-center font-black text-[10px] sticky top-0 z-[100] flex items-center justify-center gap-2 shadow-lg"><RefreshCw size={14} className="animate-spin" /> جاري المزامنة...</div>}
      {!isOnline && <div className="bg-orange-600 text-white py-2 text-center font-black text-[10px] sticky top-0 z-[100] flex items-center justify-center gap-2 shadow-lg shadow-orange-100"><WifiOff size={14} /> وضع الأوفلاين</div>}

      <div className="max-w-[1600px] mx-auto p-4 md:p-8 space-y-6">
        
        {/* Header */}
        <header className="bg-white p-6 md:p-8 rounded-[32px] md:rounded-[40px] shadow-sm border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push("/dashboard")} className="p-3 bg-slate-50 text-slate-400 rounded-2xl hover:text-blue-600 border border-slate-100 transition-all shadow-sm"><ArrowRight size={20} /></button>
            <div className="w-14 h-14 bg-blue-600 rounded-3xl flex items-center justify-center text-white shadow-xl hidden md:flex"><Calendar size={28} /></div>
            <div>
              <h1 className="text-xl md:text-2xl font-black">{halqaName}</h1>
              <div className="flex items-center gap-2 text-slate-500 font-bold text-sm flex-wrap mt-1">
                <div className="bg-slate-100 px-2 py-1 rounded-lg flex items-center gap-1.5"><Users size={14} className="text-blue-500" /> {students.length} طالب</div>
                <div className="bg-green-50 px-2 py-1 rounded-lg text-green-700 flex items-center gap-1.5"><CheckCircle2 size={14} /> {presentTodayCount} حاضر</div>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setIsBulkAddOpen(true)} className="p-3 bg-white text-slate-700 rounded-xl border border-slate-200 font-bold flex items-center gap-2 shadow-sm active:bg-slate-50"><FileJson size={18} /> <span className="hidden md:inline">جماعي</span></button>
            <button onClick={() => setIsInviteModalOpen(true)} className="p-3 bg-blue-50 text-blue-600 rounded-xl border border-blue-100 font-bold flex items-center gap-2 shadow-sm px-4"><Mail size={18} /> <span className="hidden md:inline">دعوة</span></button>
            <button onClick={() => setIsSettingsOpen(true)} className="p-3 bg-slate-50 text-slate-600 rounded-xl border border-slate-100 shadow-sm"><Settings size={20} /></button>
            <button onClick={scrollToToday} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-blue-50 text-blue-700 px-5 py-3 rounded-xl font-black border border-blue-100 active:scale-95 shadow-sm">اليوم</button>
            <button onClick={() => setIsAddModalOpen(true)} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-blue-600 text-white px-5 py-3 rounded-xl font-bold shadow-lg shadow-blue-200 transition-all"><Plus size={20} /> إضافة طالب</button>
          </div>
        </header>

        {/* --- MOBILE: TAB VIEW --- */}
        <div className="md:hidden">
          {activeTab === 'attendance' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <div className="relative flex-1"><User className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input type="text" placeholder="بحث بالاسم..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-white border border-slate-100 rounded-2xl py-3.5 pr-12 pl-4 font-bold outline-none shadow-sm text-sm" /></div>
                <button onClick={() => setIsFastMode(!isFastMode)} className={cn("px-4 rounded-2xl border transition-all flex items-center justify-center shadow-sm", isFastMode ? "bg-amber-100 border-amber-200 text-amber-600" : "bg-white border-slate-100 text-slate-400")}><Zap size={20} /></button>
              </div>
              
              <div className="flex flex-col gap-2 bg-white p-2 rounded-[28px] border border-slate-100 shadow-sm">
                 <div className="flex gap-1">{["all", "male", "female"].map(g => (<button key={g} onClick={() => setGenderFilter(g as any)} className={cn("flex-1 py-2 rounded-2xl font-black text-[10px] transition-all", genderFilter === g ? "bg-slate-900 text-white" : "text-slate-400")}>{g === 'all' ? 'الكل' : g === 'male' ? 'طلاب' : 'طالبات'}</button>))}</div>
                 <div className="h-px bg-slate-50 mx-4"></div>
                 <div className="flex gap-1">{["all", "present", "absent"].map(a => (<button key={a} onClick={() => setAttendanceFilter(a as any)} className={cn("flex-1 py-2 rounded-2xl font-black text-[10px] transition-all flex items-center justify-center gap-1.5", attendanceFilter === a ? "bg-blue-600 text-white" : "text-slate-400")}>{a === 'all' ? "الكل" : a === 'present' ? "حاضر اليوم" : "غائب اليوم"}</button>))}</div>
              </div>

              {isFastMode ? (
                <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm divide-y divide-slate-50">
                  <div className="p-4 bg-amber-50/50 flex justify-between items-center"><span className="text-[10px] font-black text-amber-600">التحضير السريع (أول ضغطة = حاضر ✅)</span><Zap size={14} className="text-amber-500 animate-pulse"/></div>
                  {filteredStudents.map(s => {
                    const status = attendance[`${s.id}-${format(new Date(), "yyyy-MM-dd")}`];
                    return (
                      <div key={s.id} className="p-4 flex items-center justify-between group active:bg-slate-50 transition-all">
                        <div className="flex items-center gap-3"><div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black", s.gender === 'female' ? "bg-pink-50 text-pink-500" : "bg-blue-50 text-blue-500")}>{s.name.charAt(0)}</div><span className="font-black text-slate-800">{s.name}</span></div>
                        <button onMouseDown={(e) => handleStart(e, s.id, new Date())} onMouseUp={(e) => handleEnd(e, s.id, new Date())} onTouchStart={(e) => handleStart(e, s.id, new Date())} onTouchEnd={(e) => handleEnd(e, s.id, new Date())} onContextMenu={(e) => { e.preventDefault(); handleToggle(s.id, new Date(), 'excused'); }}
                          className={cn("w-14 h-14 rounded-2xl border-2 flex items-center justify-center transition-all", status === 'absent' ? "bg-red-500 border-red-500 text-white shadow-lg" : status === 'excused' ? "bg-amber-500 border-amber-500 text-white" : status === 'present' ? "bg-green-500 border-green-500 text-white shadow-md" : "bg-white border-slate-100 text-slate-200")}>{status === 'absent' ? <XCircle size={28} strokeWidth={2.5}/> : status === 'excused' ? "📝" : status === 'present' ? <CheckCircle2 size={28} strokeWidth={2.5}/> : <div className="w-4 h-4 rounded-full border-2 border-slate-100"></div>}</button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                filteredStudents.map(s => {
                  const monthAbs = getFilteredAbsenceCount(s.id, currentDate);
                  return (
                    <div key={s.id} className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden animate-in fade-in">
                      <div className="p-5 flex justify-between items-start">
                        <div className="flex gap-4"><div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg", s.gender === 'female' ? "bg-pink-50 text-pink-500" : "bg-blue-50 text-blue-500")}>{s.name.charAt(0)}</div><div><h3 className="font-black text-slate-800 text-base">{s.name}</h3><p className="text-[10px] font-bold text-slate-400" dir="ltr">{s.parent_phone}</p></div></div>
                        <div className="text-left"><p className="text-[8px] font-black text-slate-400 uppercase">غياب الشهر</p><p className="text-xl font-black text-red-600 leading-tight">{getFilteredAbsenceCount(s.id, currentDate)} يوم</p></div>
                      </div>
                      <div className="px-5 pb-5">
                        <div className="flex justify-between items-center mb-3"><h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest">سجل الشهر</h4><button onClick={() => scrollToToday()} className="flex items-center gap-1 text-blue-600 bg-blue-50 px-2 py-1 rounded-lg font-black text-[8px]"><Target size={10} /> اليوم</button></div>
                        <div ref={el => { timelineRefs.current[s.id] = el; }} className="flex gap-2 overflow-x-auto no-scrollbar py-2">
                          {workingDaysOfMonth.map(d => {
                            const status = attendance[`${s.id}-${format(d, "yyyy-MM-dd")}`];
                            const isToday = isSameDay(d, new Date());
                            return (
                              <button key={d.toString()} data-today={isToday} onMouseDown={(e) => handleStart(e, s.id, d)} onMouseUp={(e) => handleEnd(e, s.id, d)} onTouchStart={(e) => handleStart(e, s.id, d)} onTouchEnd={(e) => handleEnd(e, s.id, d)} onContextMenu={(e) => { e.preventDefault(); handleToggle(s.id, d, 'excused'); }}
                                className={cn("flex-shrink-0 w-12 flex flex-col items-center gap-1.5 p-2 rounded-2xl border transition-all", isToday ? "bg-blue-600 border-blue-600 shadow-lg text-white" : "bg-slate-50 border-slate-100")}>
                                <span className={cn("text-[8px] font-black", isToday ? "text-blue-100" : "text-slate-400")}>{format(d, "d/M")}</span>
                                <div className={cn("w-7 h-7 rounded-xl flex items-center justify-center transition-all", status === 'absent' ? "bg-red-500 text-white shadow-sm" : status === 'excused' ? "bg-amber-500 text-white shadow-sm" : status === 'present' ? "bg-green-500 text-white shadow-sm" : "bg-white/50")}>{status === 'absent' ? <XCircle size={14} /> : status === 'excused' ? "📝" : status === 'present' ? <CheckCircle2 size={14} /> : <div className="w-2 h-2 rounded-full bg-slate-200"></div>}</div>
                                <span className={cn("text-[8px] font-black", isToday ? "text-white" : "text-slate-400")}>{format(d, "EEE", { locale: ar }).split(' ')[0]}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="p-4 bg-slate-50 flex justify-between items-center text-[10px] font-black"><div className="flex items-center gap-1.5 text-green-600"><Target size={12} /><span>نسبة الالتزام: {Math.max(0, 100 - (getFilteredAbsenceCount(s.id) * 3))}%</span></div><button onClick={() => setSelectedStudent(s)} className="text-blue-600 flex items-center gap-1 font-bold"><span>التفاصيل</span><ChevronLeft size={12} /></button></div>
                    </div>
                  );
                })
              )}
            </div>
          )}
          {activeTab === 'reports' && (
            <div className="space-y-6 animate-in slide-in-from-left-4">
               <div className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-100">
                  <h3 className="font-black text-base flex items-center gap-2 mb-6"><XCircle size={20} className="text-orange-500" /> غياب اليوم</h3>
                  <div className="space-y-3">{absentToday.length > 0 ? absentToday.map(s => (
                    <div key={s.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100"><span className="font-black text-sm">{s.name}</span><a href={`tel:${s.parent_phone}`} className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-blue-200"><Phone size={16} /></a></div>
                  )) : <div className="py-10 text-center"><CheckCircle2 className="mx-auto text-green-200 mb-2" size={32}/><p className="text-slate-400 font-bold">الكل حاضر اليوم 👍</p></div>}</div>
               </div>
               <div className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-100">
                  <h3 className="font-black text-base flex items-center gap-2 mb-6"><AlertTriangle size={20} className="text-red-500" /> إنذارات الشهر</h3>
                  {studentsWithWarnings.map(s => (<div key={s.id} className="p-4 bg-red-50 rounded-3xl border border-red-100 mb-2 flex justify-between items-center"><div><span className="font-black text-slate-800 text-sm block">{s.name}</span><span className="bg-white px-3 py-1 rounded-full text-red-600 font-black text-[10px] border border-red-100 mt-2 inline-block">{getFilteredAbsenceCount(s.id, currentDate)} أيام غياب</span></div><a href={`tel:${s.parent_phone}`} className="w-12 h-12 bg-white text-red-500 rounded-2xl flex items-center justify-center border border-red-100 shadow-sm"><Phone size={20} /></a></div>))}
               </div>
            </div>
          )}
          {activeTab === 'stats' && (
             <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-[40px] p-8 text-white shadow-xl shadow-blue-200 text-center"><h3 className="font-black text-lg mb-8 opacity-80 uppercase tracking-widest">إحصائيات الحلقة</h3><div className="grid grid-cols-2 gap-4"><div className="bg-white/10 p-6 rounded-[32px] border border-white/10 text-center"><Users className="mx-auto mb-3 opacity-60" size={24}/><p className="text-4xl font-black">{students.length}</p><p className="text-[10px] font-black uppercase opacity-60 mt-1">طالباً</p></div><div className="bg-white/10 p-6 rounded-[32px] border border-white/10 text-center"><Target className="mx-auto mb-3 opacity-60" size={24}/><p className="text-4xl font-black text-green-300">{Math.round((presentTodayCount / (students.length || 1)) * 100)}%</p><p className="text-[10px] font-black uppercase opacity-60 mt-1">الحضور اليوم</p></div><div className="bg-white/10 p-5 rounded-[32px] border border-white/10 col-span-2 flex justify-around"><div><p className="text-blue-100 text-[10px] font-black">ذكور</p><p className="text-2xl font-black">{students.filter(s => s.gender === 'male').length}</p></div><div className="w-px bg-white/10 h-10 self-center"></div><div><p className="text-blue-100 text-[10px] font-black">إناث</p><p className="text-2xl font-black text-pink-300">{students.filter(s => s.gender === 'female').length}</p></div></div></div></div>
          )}
        </div>

        {/* --- DESKTOP VIEW --- */}
        <div className="hidden md:grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3 space-y-6">
            <div className="flex gap-4"><div className="relative flex-1"><User className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} /><input type="text" placeholder="بحث بالاسم..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-white border border-slate-100 rounded-2xl py-4 pr-12 pl-4 font-bold outline-none shadow-sm text-slate-800 font-bold" /></div><div className="flex gap-1.5 bg-white p-1.5 rounded-2xl border border-slate-100 shadow-sm">{["all", "male", "female"].map(g => (<button key={g} onClick={() => setGenderFilter(g as any)} className={cn("px-6 py-2 rounded-xl font-black text-xs transition-all", genderFilter === g ? "bg-blue-600 text-white shadow-md shadow-blue-100" : "text-slate-400")}>{g === 'all' ? 'الكل' : g === 'male' ? 'طلاب' : 'طالبات'}</button>))}</div></div>
            <div className="bg-white rounded-[32px] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden"><div className="p-5 border-b flex items-center justify-between bg-slate-50/50"><div className="flex items-center gap-4"><button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)))} className="p-2 bg-white rounded-lg border hover:bg-slate-100 transition-all"><ChevronRight size={20} /></button><span className="font-black text-slate-800 text-lg">{format(currentDate, "MMMM yyyy", { locale: ar })}</span><button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)))} className="p-2 bg-white rounded-lg border hover:bg-slate-100 transition-all"><ChevronLeft size={20} /></button></div><button onClick={scrollToToday} className="bg-blue-50 text-blue-700 px-4 py-2 rounded-xl font-black text-xs border border-blue-100 shadow-sm transition-all active:scale-95">الذهاب لليوم</button></div><div className="overflow-x-auto relative" ref={scrollContainerRef}><table className="w-full border-collapse"><thead><tr className="bg-slate-50/30 font-black text-[10px] text-slate-400 uppercase tracking-widest"><th className="sticky right-0 z-30 bg-white p-6 text-right border-l border-b min-w-[240px]">اسم الطالب</th><th className="p-6 text-center border-l border-b min-w-[100px]">الغياب</th>{days.map(d => (<th key={d.toString()} ref={isSameDay(d, new Date()) ? todayRef : null} className={cn("p-4 text-center border-l border-b min-w-[65px] relative", isSameDay(d, new Date()) ? "bg-blue-600 text-white shadow-lg" : "", isHoliday(d) && "bg-orange-50/50 text-orange-400")}><div className="text-[10px] font-black">{format(d, "EEE", { locale: ar })}</div><div className="text-xl font-black">{format(d, "d")}</div></th>))}</tr></thead><tbody>{filteredStudents.map(s => { const mAbs = getFilteredAbsenceCount(s.id, currentDate); return (<tr key={s.id} className="border-b hover:bg-blue-50/10 transition-all group"><td className="sticky right-0 z-20 bg-white group-hover:bg-[#fcfdfe] p-5 text-right border-l font-bold shadow-[4px_0_10px_-4px_rgba(0,0,0,0.05)]"><button onClick={() => setSelectedStudent(s)} className="flex items-center gap-3 text-right w-full hover:text-blue-600 transition-all"><div className={cn("w-10 h-10 rounded-xl flex items-center justify-center transition-all", s.gender === 'female' ? "bg-pink-50 text-pink-400" : "bg-blue-50 text-blue-400")}><User size={20} /></div><span className="text-sm font-black text-slate-800">{s.name}</span></button></td><td className="p-5 text-center border-l font-black"><div className={cn("w-12 h-10 rounded-lg flex items-center justify-center text-xs mx-auto border", mAbs >= absenceThreshold ? "bg-red-600 text-white border-red-700 shadow-md" : "bg-white text-slate-600 border-slate-100")}>{mAbs}</div></td>{days.map(d => { const status = attendance[`${s.id}-${format(d, "yyyy-MM-dd")}`]; const isHol = isHoliday(d); return (<td key={d.toString()} className={cn("p-2 text-center border-l cursor-pointer select-none transition-all", isHol && "bg-slate-50/50 pointer-events-none")} onClick={() => handleToggle(s.id, d)} onContextMenu={(e) => { e.preventDefault(); handleToggle(s.id, d, 'excused'); }}>{!isHol ? (<div className={cn("w-7 h-7 rounded-lg flex items-center justify-center mx-auto transition-all", status === 'absent' ? "bg-red-600 text-white shadow-md scale-110" : status === 'excused' ? "bg-amber-500 text-white shadow-md scale-110" : status === 'present' ? "bg-green-500 text-white shadow-md scale-110" : "bg-white text-slate-200 border border-slate-100 shadow-sm")}>{status === 'absent' ? <XCircle size={14} strokeWidth={3} /> : status === 'excused' ? "📝" : status === 'present' ? <CheckCircle2 size={14} strokeWidth={3} /> : <div className="w-2 h-2 rounded-full border border-slate-100"></div>}</div>) : <Palmtree size={12} className="mx-auto text-orange-200 opacity-40" />}</td>); })}</tr>); })}</tbody></table></div></div>
          </div>

          {/* Desktop Sidebar */}
          <div className="hidden lg:block space-y-6">
            <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-[32px] p-6 text-white shadow-lg shadow-blue-200"><div className="flex items-center justify-between mb-4"><h3 className="font-black text-lg flex items-center gap-2"><Users size={22} /> إحصائيات الحلقة</h3><button onClick={() => setIsStatsVisible(!isStatsVisible)} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all shadow-sm">{isStatsVisible ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}</button></div>{isStatsVisible && (<div className="grid grid-cols-2 gap-3 text-center animate-in fade-in duration-300"><div className="bg-white/10 p-3 rounded-2xl border border-white/10"><p className="text-blue-100 text-[10px] font-black uppercase">الذكور</p><p className="text-xl font-black">{students.filter(s => s.gender === 'male').length}</p></div><div className="bg-white/10 p-3 rounded-2xl border border-white/10"><p className="text-blue-100 text-[10px] font-black uppercase">الإناث</p><p className="text-xl font-black">{students.filter(s => s.gender === 'female').length}</p></div><div className="bg-white/10 p-3 rounded-2xl border border-white/10"><p className="text-blue-100 text-[10px] font-black uppercase">حضور</p><p className="text-xl font-black text-green-300">{presentTodayCount}</p></div><div className="bg-white/10 p-3 rounded-2xl border border-white/10"><p className="text-blue-100 text-[10px] font-black uppercase">غياب</p><p className="text-xl font-black text-red-300">{absentToday.length}</p></div></div>)}</div>
            <div className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-100 text-slate-800"><h3 className="font-black text-sm flex items-center gap-2 mb-4 text-slate-800 uppercase tracking-widest"><AlertTriangle size={18} className="text-red-500" /> إنذارات الشهر</h3><div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">{studentsWithWarnings.map(s => (<div key={s.id} className="flex items-center justify-between p-3 bg-red-50 rounded-2xl border border-red-100 text-[10px] font-black"><span className="text-slate-700 truncate max-w-[80px]">{s.name}</span><div className="flex gap-2"><span className="text-red-600 bg-white px-2 py-1 rounded-lg border border-red-100">{getFilteredAbsenceCount(s.id, currentDate)} غياب</span><a href={`tel:${s.parent_phone}`} className="text-red-500 p-2 bg-white rounded-xl shadow-sm border border-red-100 hover:bg-red-50 transition-all"><Phone size={14} /></a></div></div>))}</div></div>
            <div className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-100 text-slate-800"><h3 className="font-black text-sm flex items-center gap-2 mb-4 uppercase tracking-widest"><XCircle size={18} className="text-orange-500" /> غياب اليوم</h3><div className="space-y-2">{absentToday.length > 0 ? absentToday.map(s => (<div key={s.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100 text-[10px] font-black"><span>{s.name}</span><a href={`tel:${s.parent_phone}`} className="text-blue-500 p-2 bg-white rounded-xl shadow-sm border border-slate-100 hover:bg-blue-50 transition-all"><Phone size={14} /></a></div>)) : <p className="text-center text-slate-400 text-xs py-4 font-bold italic">الكل حاضر 👍</p>}</div></div>
          </div>
        </div>
      </div>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-slate-100 p-4 pb-6 flex justify-around items-center z-[150] shadow-lg"><button onClick={() => router.push("/dashboard")} className="flex flex-col items-center gap-1 text-slate-400"><LayoutGrid size={24} /><span className="text-[10px] font-black">حلقات</span></button><button onClick={() => setActiveTab('attendance')} className={cn("flex flex-col items-center gap-1", activeTab === 'attendance' ? "text-blue-600 scale-110" : "text-slate-400")}><div className={cn("p-2 rounded-2xl transition-all", activeTab === 'attendance' && "bg-blue-600 text-white shadow-lg shadow-blue-200")}><CheckCircle2 size={24} /></div><span className="text-[10px] font-black">حضور</span></button><button onClick={() => setActiveTab('reports')} className={cn("flex flex-col items-center gap-1", activeTab === 'reports' ? "text-blue-600 scale-110" : "text-slate-400")}><div className={cn("p-2 rounded-2xl transition-all", activeTab === 'reports' && "bg-blue-600 text-white shadow-lg shadow-blue-200")}><BarChart3 size={24} /></div><span className="text-[10px] font-black">تقارير</span></button><button onClick={() => setActiveTab('stats')} className={cn("flex flex-col items-center gap-1", activeTab === 'stats' ? "text-blue-600 scale-110" : "text-slate-400")}><div className={cn("p-2 rounded-2xl transition-all", activeTab === 'stats' && "bg-blue-600 text-white shadow-lg shadow-blue-200")}><PieChart size={24} /></div><span className="text-[10px] font-black">إحصائيات</span></button></nav>

      {/* --- ALL MODALS --- */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center bg-slate-900/40 backdrop-blur-sm p-0 md:p-4">
          <div className="bg-white w-full max-w-md rounded-t-[40px] md:rounded-[40px] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-20 duration-300">
            <div className="bg-blue-600 p-8 text-white text-center"><h3 className="text-2xl font-black text-white">دعوة معلم</h3></div>
            <div className="p-8 space-y-6"><div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase px-1">البريد الإلكتروني</label><input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 font-bold outline-none text-slate-800 text-right" dir="ltr" placeholder="teacher@example.com" /></div><div className="flex gap-4 pt-2"><button onClick={handleInvite} className="flex-1 bg-blue-600 text-white font-black py-4 rounded-2xl shadow-lg">إرسال</button><button onClick={() => setIsInviteModalOpen(false)} className="flex-1 bg-slate-100 text-slate-500 font-black py-4 rounded-2xl">إلغاء</button></div></div>
          </div>
        </div>
      )}

      {selectedStudent && (
        <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center bg-slate-900/40 backdrop-blur-sm p-0 md:p-4">
          <div className="bg-white w-full max-w-lg rounded-t-[40px] md:rounded-[40px] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-20 duration-300">
            {isEditing ? (
              <form onSubmit={handleUpdateStudent}>
                <div className="bg-slate-900 p-8 text-white flex justify-between items-center"><h3 className="text-xl font-black">تعديل البيانات</h3><button type="button" onClick={() => setIsEditing(false)}><XCircle size={24} /></button></div>
                <div className="p-8 space-y-5 text-slate-800 text-right font-bold"><div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">الاسم الكامل</label><input required type="text" value={editStudent?.name} onChange={e => setEditStudent(p => p ? {...p, name: e.target.value} : null)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 font-bold outline-none text-slate-800" /></div><div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">رقم الهاتف</label><input type="tel" value={editStudent?.parent_phone} onChange={e => setEditStudent(p => p ? {...p, parent_phone: e.target.value} : null)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 font-bold outline-none text-left text-slate-800" dir="ltr" /></div><div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">النوع</label><div className="flex gap-2"><button type="button" onClick={() => setEditStudent(p => p ? {...p, gender: 'male'} : null)} className={cn("flex-1 py-3 rounded-xl font-bold border transition-all", editStudent?.gender === 'male' ? "bg-blue-600 text-white border-blue-600 shadow-md" : "bg-slate-50 text-slate-400")}>ذكر</button><button type="button" onClick={() => setEditStudent(p => p ? {...p, gender: 'female'} : null)} className={cn("flex-1 py-3 rounded-xl font-bold border transition-all", editStudent?.gender === 'female' ? "bg-pink-600 text-white border-pink-600 shadow-md" : "bg-slate-50 text-slate-400")}>أنثى</button></div></div><div className="flex gap-3 pt-4"><button type="submit" className="flex-1 bg-blue-600 text-white font-black py-4 rounded-2xl shadow-lg">تحديث</button><button type="button" onClick={() => setIsEditing(false)} className="flex-1 bg-slate-50 text-slate-400 font-black py-4 rounded-2xl">إلغاء</button></div></div>
              </form>
            ) : (
              <div className="p-10 text-center text-slate-800"><div className={cn("h-32 p-8 relative flex items-end mb-16", selectedStudent.gender === 'female' ? "bg-gradient-to-br from-pink-600 to-pink-500" : "bg-gradient-to-br from-blue-600 to-blue-500")}><button onClick={() => setSelectedStudent(null)} className="absolute top-6 right-6 w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-white"><XCircle size={20} /></button><div className="flex items-center gap-4 translate-y-10 px-4"><div className="w-20 h-20 bg-white rounded-2xl shadow-xl flex items-center justify-center text-blue-600 border-[4px] border-white"><User size={40} /></div><div className="pb-2 text-right"><h3 className="text-xl font-black text-slate-800">{selectedStudent.name}</h3><div className="bg-white/80 px-2 py-0.5 rounded-lg text-[10px] font-black text-slate-500 border border-white mt-1" dir="ltr">{selectedStudent.parent_phone || "لا يوجد هاتف"}</div></div></div></div><div className="grid grid-cols-3 gap-3 text-slate-800 mb-8"><div className="bg-red-50 p-4 rounded-3xl border border-red-100 text-center"><p className="text-red-400 text-[8px] font-black uppercase mb-1">غياب كلي</p><p className="text-2xl font-black text-red-600">{getFilteredAbsenceCount(selectedStudent.id)}</p></div><div className="bg-amber-50 p-4 rounded-3xl border border-amber-100 text-center"><p className="text-amber-500 text-[8px] font-black uppercase mb-1">استئذان</p><p className="text-2xl font-black text-amber-600">{Object.keys(attendance).filter(k => k.startsWith(`${selectedStudent.id}-`) && attendance[k] === 'excused').length}</p></div><div className="bg-slate-900 p-4 rounded-3xl text-center"><p className="text-slate-400 text-[8px] font-black uppercase mb-1">شهري</p><p className="text-2xl font-black text-white">{getFilteredAbsenceCount(selectedStudent.id, currentDate)}</p></div></div><div className="bg-green-50 p-6 rounded-3xl border border-green-100 relative overflow-hidden mb-8"><Target size={40} className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-all"/><p className="text-green-400 text-[10px] font-black uppercase">نسبة الالتزام العامة</p><p className="text-5xl font-black text-green-600">{Math.max(0, 100 - (getFilteredAbsenceCount(selectedStudent.id) * 3))}%</p></div><div className="flex gap-3"><button onClick={() => { if(confirm("حذف؟")) { supabase.from("students").delete().eq("id", selectedStudent.id).then(() => { db.students.delete(selectedStudent.id); fetchData(); setSelectedStudent(null); }); } }} className="p-4 bg-red-50 text-red-500 rounded-2xl hover:bg-red-100 transition-all shadow-sm"><Trash2 size={24} /></button><button onClick={() => { setIsEditing(true); setEditStudent(selectedStudent); }} className="flex-1 bg-slate-50 text-slate-800 font-black py-4 rounded-2xl border border-slate-200 shadow-sm">تعديل</button><button onClick={() => setSelectedStudent(null)} className="flex-1 bg-slate-900 text-white font-black py-4 rounded-2xl shadow-xl">إغلاق</button></div></div>
            )}
          </div>
        </div>
      )}

      {isAddModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center bg-slate-900/40 backdrop-blur-sm p-0 md:p-4">
          <div className="bg-white w-full max-w-md rounded-t-[40px] md:rounded-[40px] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-20 duration-300">
            <div className="bg-blue-600 p-8 text-white text-center"><h3 className="text-2xl font-black">إضافة طالب</h3></div>
            <form onSubmit={handleAddStudent} className="p-8 space-y-5 text-slate-800 text-right font-bold">
              <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase px-1">الاسم الكامل</label><input required type="text" value={newStudent.name} onChange={e => setNewStudent({...newStudent, name: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 font-bold text-slate-800 outline-none focus:ring-4 focus:ring-blue-500/10" /></div>
              <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase px-1">الهاتف (اختياري)</label><input type="tel" value={newStudent.parent_phone} onChange={e => setNewStudent({...newStudent, parent_phone: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 font-bold outline-none text-left text-slate-800" dir="ltr" placeholder="05xxxxxxxx" /></div>
              <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase px-1">النوع</label><div className="flex gap-2"><button type="button" onClick={() => setNewStudent({...newStudent, gender: 'male'})} className={cn("flex-1 py-3 rounded-xl font-bold border transition-all", newStudent.gender === 'male' ? "bg-blue-600 text-white border-blue-600 shadow-md" : "bg-slate-50 text-slate-400")}>ذكر</button><button type="button" onClick={() => setNewStudent({...newStudent, gender: 'female'})} className={cn("flex-1 py-3 rounded-xl font-bold border transition-all", newStudent.gender === 'female' ? "bg-pink-600 text-white border-pink-600 shadow-md" : "bg-slate-50 text-slate-400")}>أنثى</button></div></div>
              <div className="flex gap-3 pt-2"><button type="submit" className="flex-1 bg-blue-600 text-white font-black py-4 rounded-2xl shadow-lg">حفظ</button><button type="button" onClick={() => setIsAddModalOpen(false)} className="flex-1 bg-slate-50 text-slate-400 font-black py-4 rounded-2xl">إلغاء</button></div>
            </form>
          </div>
        </div>
      )}

      {isBulkAddOpen && (
        <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center bg-slate-900/40 backdrop-blur-sm p-0 md:p-4">
          <div className="bg-white w-full max-w-md rounded-t-[40px] md:rounded-[40px] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-20 duration-300">
            <div className="bg-slate-900 p-8 text-white text-center"><h3 className="text-2xl font-black">إضافة جماعية</h3></div>
            <div className="p-8 space-y-4">
              <textarea value={bulkJson} onChange={e => setBulkJson(e.target.value)} rows={8} className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 font-mono text-[10px] outline-none text-slate-800" placeholder='[{"name": "...", "gender": "male"}]' />
              <div className="flex gap-3"><button onClick={handleBulkAdd} className="flex-1 bg-blue-600 text-white font-black py-4 rounded-2xl shadow-lg">استيراد</button><button onClick={() => setIsBulkAddOpen(false)} className="flex-1 bg-slate-100 text-slate-400 font-black py-4 rounded-2xl">إلغاء</button></div>
            </div>
          </div>
        </div>
      )}

      {isSettingsOpen && (
        <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center bg-slate-900/40 backdrop-blur-sm p-0 md:p-4">
          <div className="bg-white w-full max-w-md rounded-t-[40px] md:rounded-[40px] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-20 duration-300">
            <div className="bg-blue-600 p-8 text-white text-center"><h3 className="text-2xl font-black text-white">إعدادات الحلقة</h3></div>
            <div className="p-8 space-y-8"><div className="space-y-4"><label className="text-[10px] font-black text-slate-400 uppercase">أيام الإجازة</label><div className="flex flex-wrap gap-2">{["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"].map((day, i) => (<button key={day} onClick={() => setWeekendDays(prev => prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i])} className={cn("flex-1 min-w-[60px] py-3 rounded-xl font-bold text-[10px] border transition-all", weekendDays.includes(i) ? "bg-blue-600 text-white border-blue-600 shadow-sm" : "bg-slate-50 text-slate-400 border-slate-100")}>{day}</button>))}</div></div><div className="space-y-4"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">حد إنذار الغياب ({absenceThreshold})</label><input type="range" min="1" max="15" value={absenceThreshold} onChange={e => setAbsenceThreshold(parseInt(e.target.value))} className="w-full accent-blue-600 h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer" /></div><button onClick={saveSettings} className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl shadow-lg shadow-blue-200 transition-all">حفظ</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
