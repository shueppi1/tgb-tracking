import catalog from '../../../shared/events.json';
import type { Position } from './types';

export type EventTarget = 'none' | 'any' | 'field' | 'goalkeeper';

export interface EventType {
  id: string;
  label: string;
  target: EventTarget;
  group: string;
}

export interface EventGroup {
  id: string;
  label: string;
}

export const EVENT_TYPES: EventType[] = catalog.events as EventType[];
export const EVENT_GROUPS: EventGroup[] = catalog.groups;

export const EVENT_BY_ID: ReadonlyMap<string, EventType> = new Map(
  EVENT_TYPES.map((e) => [e.id, e]),
);

export function eventLabel(id: string): string {
  return EVENT_BY_ID.get(id)?.label ?? id;
}

export function eventsInGroup(groupId: string): EventType[] {
  return EVENT_TYPES.filter((e) => e.group === groupId);
}

/** Positions a roster member must have to receive an event with this target. */
export function allowedPositions(target: EventTarget): Position[] {
  switch (target) {
    case 'none':
      return [];
    case 'any':
      return ['field', 'goalkeeper'];
    default:
      return [target];
  }
}

/** Events recorded per roster member (field players *and* goalkeepers can score). */
export const PLAYER_EVENT_IDS = EVENT_TYPES.filter(
  (e) => e.target === 'any' || e.target === 'field',
).map((e) => e.id);

/** Goalkeeper-only events. */
export const KEEPER_EVENT_IDS = EVENT_TYPES.filter((e) => e.target === 'goalkeeper').map(
  (e) => e.id,
);

/** Events without a player. */
export const TEAM_EVENT_IDS = EVENT_TYPES.filter((e) => e.target === 'none').map((e) => e.id);

export const SAVE_IDS = ['GEHALTEN_6M', 'GEHALTEN_7M', 'GEHALTEN_9M'];
export const CONCEDED_IDS = ['GGTOR_6M', 'GGTOR_7M', 'GGTOR_9M'];
