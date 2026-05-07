"use client";

import { useEffect, useState, useRef } from "react";
import { db } from "@/lib/db";
import { supabase } from "@/lib/supabase";

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Cache the user object to avoid calling getUser() on every action
  const cachedUserId = useRef<string | null>(null);


  const getCachedUserId = async (): Promise<string | null> => {
    if (cachedUserId.current) return cachedUserId.current;
    const { data: { user } } = await supabase.auth.getUser();
    cachedUserId.current = user?.id ?? null;
    return cachedUserId.current;
  };

  useEffect(() => {
    // Fetch and cache user ID on mount
    getCachedUserId();

    // Listen for auth changes to invalidate cache
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      cachedUserId.current = session?.user?.id ?? null;
    });

    const handleOnline = () => {
      setIsOnline(true);
      syncOfflineActions();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Initial sync check
    if (navigator.onLine) {
      syncOfflineActions();
    }


  // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      subscription.unsubscribe();
    };
  }, []);

  const syncOfflineActions = async () => {
    // Prevent overlapping syncs
    if (isSyncing) return;
    
    const actions = await db.syncQueue.toArray();
    if (actions.length === 0) return;

    setIsSyncing(true);

    const userId = await getCachedUserId();
    if (!userId) {
      setIsSyncing(false);
      return;
    }

    try {
      // Group all attendance updates and KEEP ONLY THE LATEST for each student+date
      const latestAttendanceMap = new Map();
      
      actions
        .filter(a => a.type === 'UPDATE_ATTENDANCE')
        .forEach(a => {
           const key = `${a.payload.student_id}-${a.payload.date}`;
           latestAttendanceMap.set(key, { ...a.payload, recorded_by: userId });
        });

      const attendancePayloads = Array.from(latestAttendanceMap.values());

      if (attendancePayloads.length > 0) {
        // Bulk upsert: ONE single network request for all changes!
        const { error } = await supabase
          .from("attendance")
          .upsert(attendancePayloads, { onConflict: 'student_id, date' });

        if (!error) {
          const idsToDelete = actions.map(a => a.id!);
          await db.syncQueue.bulkDelete(idsToDelete);
        } else {
           console.error("Bulk sync error:", error);
        }
      }
    } catch (err) {
      console.error("Failed to sync actions:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  const queueAction = async (type: 'UPDATE_ATTENDANCE', payload: any) => {
    // 1. Update local DB immediately for instant UI feedback
    if (type === 'UPDATE_ATTENDANCE') {
      await db.attendance.put({
        student_id: payload.student_id,
        halqa_id: payload.halqa_id,
        date: payload.date,
        status: payload.status
      });
    }

    // 2. Add to sync queue
    await db.syncQueue.add({
      type,
      payload,
      timestamp: Date.now()
    });

    // 3. Sync immediately if online
    if (navigator.onLine) syncOfflineActions();
  };

  return { isOnline, isSyncing, queueAction, syncOfflineActions };
}
