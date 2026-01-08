import { useState, useEffect } from 'react';

const VISITOR_ID_KEY = 'wulin-town-visitor-id';

function generateVisitorId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `visitor_${timestamp}_${randomPart}`;
}

export function getVisitorId(): string {
  if (typeof window === 'undefined') {
    return generateVisitorId();
  }

  let visitorId = localStorage.getItem(VISITOR_ID_KEY);
  if (!visitorId) {
    visitorId = generateVisitorId();
    localStorage.setItem(VISITOR_ID_KEY, visitorId);
  }
  return visitorId;
}

export function useVisitorId(): string {
  const [visitorId, setVisitorId] = useState<string>('');

  useEffect(() => {
    setVisitorId(getVisitorId());
  }, []);

  return visitorId;
}

export function getVisitorDisplayName(visitorId: string): string {
  // Generate a friendly display name from the visitor ID
  const shortId = visitorId.split('_').pop()?.substring(0, 4) || 'guest';
  return `访客${shortId.toUpperCase()}`;
}
