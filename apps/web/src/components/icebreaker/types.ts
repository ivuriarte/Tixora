export interface Participant {
  id: string;
  name: string;
}

export interface WheelParticipantsResponse {
  eventId: string;
  total: number;
  participants: Participant[];
}

export type IcebreakerMode = 'wheel' | 'raffle';
