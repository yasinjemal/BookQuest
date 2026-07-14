"use client";
import { useEffect } from "react";
export default function PublicCourseViewTracker({ slug }: { slug: string }) {
  useEffect(() => { const key = `bookquest.view.${slug}`; if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, "1"); void fetch(`/api/public/courses/${slug}/events`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventType: "view" }) }); }, [slug]);
  return null;
}
