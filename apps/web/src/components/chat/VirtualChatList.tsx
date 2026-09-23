'use client';
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';

/** Variable-height timeline. Only the viewport and a small overscan are mounted. */
export function VirtualChatList<T extends { id: string }>({ items, scrollRef, children }: {
  items: T[];
  scrollRef: React.RefObject<HTMLDivElement>;
  children: (item: T, index: number) => React.ReactNode;
}) {
  const heights = useRef(new Map<string, number>());
  const [revision, invalidate] = useState(0);
  const [viewport, setViewport] = useState({ top: 0, height: 800 });
  const container = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setViewport({ top: Math.max(0, scroll.getBoundingClientRect().top - (container.current?.getBoundingClientRect().top || 0)), height: scroll.clientHeight }));
    };
    scroll.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(scroll);
    update();
    return () => { scroll.removeEventListener('scroll', update); observer.disconnect(); cancelAnimationFrame(frame); };
  }, [scrollRef]);
  const measure = useCallback((id: string, height: number) => {
    if (Math.abs((heights.current.get(id) || 0) - height) < 1) return;
    heights.current.set(id, height);
    invalidate(r => r + 1);
  }, []);
  useLayoutEffect(() => {
    const ids = new Set(items.map(item => item.id));
    for (const id of heights.current.keys()) if (!ids.has(id)) heights.current.delete(id);
  }, [items]);
  void revision;
  const offsets = [0];
  for (const item of items) offsets.push(offsets[offsets.length - 1] + (heights.current.get(item.id) || 100));
  const startIndex = offsets.findIndex(offset => offset >= viewport.top - 600);
  const start = Math.max(0, Math.min(items.length - 1, (startIndex < 0 ? offsets.length : startIndex) - 1));
  let end = offsets.findIndex(offset => offset > viewport.top + viewport.height + 600);
  if (end < 0) end = items.length;
  // Small conversations keep native layout; long conversations mount a bounded window.
  const first = items.length <= 60 ? 0 : start;
  const last = items.length <= 60 ? items.length : Math.min(items.length, Math.max(first + 1, end));
  return <div ref={container} style={{ position: 'relative', paddingTop: offsets[first], paddingBottom: offsets[items.length] - offsets[last] }}>
    {items.slice(first, last).map((item, index) => <MeasuredRow key={item.id} id={item.id} onMeasure={measure}>{children(item, first + index)}</MeasuredRow>)}
  </div>;
}

function MeasuredRow({ id, onMeasure, children }: { id: string; onMeasure: (id: string, height: number) => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() => onMeasure(id, element.getBoundingClientRect().height));
    observer.observe(element);
    onMeasure(id, element.getBoundingClientRect().height);
    return () => observer.disconnect();
  }, [id, onMeasure]);
  return <div ref={ref} style={{ display: 'flow-root' }}>{children}</div>;
}
