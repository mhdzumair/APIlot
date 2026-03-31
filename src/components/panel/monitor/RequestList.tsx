import * as React from 'react';
import { useRef, useCallback, useEffect } from 'react';
import type { LogEntry } from '@/types/requests';
import { useMonitorStore } from '@/stores/useMonitorStore';
import { RequestItem } from './RequestItem';

interface PageGroup {
  pageGroupId: string;
  requests: LogEntry[];
}

function groupByPageGroup(requests: LogEntry[]): PageGroup[] {
  const map = new Map<string, LogEntry[]>();
  const order: string[] = [];

  for (const req of requests) {
    const key = req.pageGroupId ?? '__ungrouped__';
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(req);
  }

  return order.map((key) => ({
    pageGroupId: key,
    requests: map.get(key)!,
  }));
}

interface RequestListProps {
  requests: LogEntry[];
}

export function RequestList({ requests }: RequestListProps) {
  const expandedIds = useMonitorStore((s) => s.expandedIds);
  const toggleExpanded = useMonitorStore((s) => s.toggleExpanded);
  const autoScroll = useMonitorStore((s) => s.autoScroll);
  const setAutoScroll = useMonitorStore((s) => s.setAutoScroll);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastScrollTop = useRef(0);

  // Re-enable / disable auto-scroll based on scroll direction + position
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    const scrollingUp = el.scrollTop < lastScrollTop.current;
    lastScrollTop.current = el.scrollTop;

    if (isAtBottom) {
      setAutoScroll(true);
    } else if (scrollingUp) {
      setAutoScroll(false);
    }
  }, [setAutoScroll]);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [requests.length, autoScroll]);

  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-16 gap-2 text-muted-foreground select-none">
        <p className="text-sm font-medium">No requests captured yet</p>
        <p className="text-xs">Navigate to a page to start capturing requests</p>
      </div>
    );
  }

  const groups = groupByPageGroup(requests);

  return (
    <div ref={scrollContainerRef} className="flex-1 overflow-auto" onScroll={handleScroll}>
      {groups.map((group, groupIndex) => (
        <div key={group.pageGroupId}>
          {/* Group header — only show if there are multiple groups */}
          {groups.length > 1 && (
            <div className="sticky top-0 z-10 px-3 py-1 text-[10px] font-medium text-muted-foreground bg-muted/80 border-b flex items-center gap-2">
              <span>
                {group.pageGroupId === '__ungrouped__'
                  ? `Session ${groupIndex + 1}`
                  : `Session ${groupIndex + 1}`}
              </span>
              <span className="ml-auto">{group.requests.length} requests</span>
            </div>
          )}
          {group.requests.map((request) => (
            <RequestItem
              key={request.id}
              request={request}
              isExpanded={expandedIds.has(request.id)}
              onToggle={() => toggleExpanded(request.id)}
            />
          ))}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
