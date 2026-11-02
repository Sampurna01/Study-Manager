import { useCallback, useEffect, useMemo, useState } from "react";
import { db } from "./db";
import type { Course } from "./types";
import { topicMastery, readiness } from "../../shared/mastery";

export function uid(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function useCourses() {
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    db.all()
      .then((all) => setCourses(all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))))
      .catch(() => {
        setError("Your browser blocked local storage, so courses won't be saved after you close this tab.");
        setCourses([]);
      });
  }, []);

  const save = useCallback((course: Course) => {
    const updated = { ...course, updatedAt: new Date().toISOString() };
    setCourses((prev) => [updated, ...(prev ?? []).filter((c) => c.id !== course.id)]);
    db.put(updated).catch(() => setError("Couldn't save to browser storage — it may be full."));
  }, []);

  const update = useCallback((id: string, fn: (c: Course) => Course) => {
    setCourses((prev) => {
      if (!prev) return prev;
      const next = prev.map((c) => (c.id === id ? { ...fn(c), updatedAt: new Date().toISOString() } : c));
      const changed = next.find((c) => c.id === id);
      if (changed) db.put(changed).catch(() => setError("Couldn't save to browser storage — it may be full."));
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setCourses((prev) => (prev ?? []).filter((c) => c.id !== id));
    db.remove(id).catch(() => undefined);
  }, []);

  return { courses, error, save, update, remove };
}

export function useMastery(course: Course) {
  return useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of course.guide.topics) {
      map[t.id] = topicMastery(
        t.id,
        course.attempts,
        course.cards.filter((c) => c.topicId === t.id).map((c) => c.schedule),
      );
    }
    return { mastery: map, readiness: readiness(course.guide.topics, map) };
  }, [course.guide.topics, course.attempts, course.cards]);
}
