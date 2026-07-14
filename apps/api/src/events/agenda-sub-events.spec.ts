import { BadRequestException } from '@nestjs/common';
import { getAgendaSubEvents, resolveAgendaSubEvent } from './agenda-sub-events';

describe('agenda sub-event helpers', () => {
  const agenda = [
    { id: 'intro', time: '9:00 AM', title: 'Opening', isSubEvent: false },
    { id: 'workshop-a', time: '10:00 AM', title: 'Workshop A', isSubEvent: true },
    { id: 'workshop-b', time: '1:00 PM', title: 'Workshop B', isSubEvent: true },
  ];

  it('returns only valid agenda items marked as sub-events', () => {
    expect(getAgendaSubEvents(agenda)).toEqual([
      { id: 'workshop-a', time: '10:00 AM', title: 'Workshop A' },
      { id: 'workshop-b', time: '1:00 PM', title: 'Workshop B' },
    ]);
  });

  it('does not require a selection when no agenda item is a sub-event', () => {
    expect(resolveAgendaSubEvent([{ id: 'intro', title: 'Opening' }], undefined)).toBeNull();
  });

  it('requires and resolves a valid sub-event selection', () => {
    expect(resolveAgendaSubEvent(agenda, 'workshop-b')).toEqual({
      id: 'workshop-b',
      time: '1:00 PM',
      title: 'Workshop B',
    });
    expect(() => resolveAgendaSubEvent(agenda, '')).toThrow(BadRequestException);
    expect(() => resolveAgendaSubEvent(agenda, 'missing')).toThrow(BadRequestException);
  });
});
