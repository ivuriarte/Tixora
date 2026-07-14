import { BadRequestException } from '@nestjs/common';

export interface AgendaSubEvent {
  id: string;
  title: string;
  time?: string;
}

export function getAgendaSubEvents(agenda: unknown): AgendaSubEvent[] {
  if (!Array.isArray(agenda)) return [];
  return agenda
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    .filter((item) => item.isSubEvent === true)
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id.trim() : '',
      title: typeof item.title === 'string' ? item.title.trim() : '',
      time: typeof item.time === 'string' ? item.time.trim() : undefined,
    }))
    .filter((item) => item.id.length > 0 && item.title.length > 0);
}

export function resolveAgendaSubEvent(
  agenda: unknown,
  selectedId?: string | null,
): AgendaSubEvent | null {
  const subEvents = getAgendaSubEvents(agenda);
  if (subEvents.length === 0) return null;

  const normalizedId = selectedId?.trim();
  if (!normalizedId) {
    throw new BadRequestException('Please choose the sub-event you will attend.');
  }

  const selected = subEvents.find((item) => item.id === normalizedId);
  if (!selected) {
    throw new BadRequestException('Selected sub-event is not available for this event.');
  }

  return selected;
}
