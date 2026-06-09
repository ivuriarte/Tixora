'use client';

import { useEffect } from 'react';
import { trackPixelEvent } from '@/lib/metaPixel';
import { trackInternalFunnelEvent } from '@/lib/funnel';

interface Props {
  eventId: string;
  eventSlug: string;
  eventTitle: string;
}

export default function EventFunnelTracker({ eventId, eventSlug, eventTitle }: Props) {
  useEffect(() => {
    const dedupeKey = `viewcontent:${eventId}`;

    trackPixelEvent(
      'ViewContent',
      {
        content_type: 'event',
        content_name: eventTitle,
        content_ids: [eventId],
        event_slug: eventSlug,
      },
      dedupeKey,
    );

    void trackInternalFunnelEvent({
      eventId,
      step: 'event_page_viewed',
      status: 'success',
      metadata: { eventSlug, eventTitle },
    });
  }, [eventId, eventSlug, eventTitle]);

  return null;
}
