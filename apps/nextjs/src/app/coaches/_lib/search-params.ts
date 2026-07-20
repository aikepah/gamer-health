import type { CoachSpecialty } from "@gamer-health/validators";
import { COACH_SPECIALTIES } from "@gamer-health/validators";

import { minutesFromTimeString, timeStringFromMinutes } from "~/lib/format";

export const PAGE_SIZE = 20;

export interface CoachSearchFilters {
  query?: string;
  gameId?: string;
  specialties?: CoachSpecialty[];
  weekdays?: number[];
  fromMinute?: number;
  toMinute?: number;
}

export type ParsedCoachSearchParams = Record<
  string,
  string | string[] | undefined
>;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const SPECIALTY_SET = new Set<string>(COACH_SPECIALTIES);

/**
 * Parses `/coaches` URL search params into `searchCoachesInput` (minus
 * limit/offset defaults handled here too). Shared by the server page
 * (initial prefetch) and the client component (re-derives the same shape
 * for the live query as filters change).
 */
export function parseCoachSearchParams(
  params: ParsedCoachSearchParams,
): CoachSearchFilters & { limit: number; offset: number } {
  const trimmedQuery = firstParam(params.q)?.trim();
  const query = (trimmedQuery?.length ?? 0) > 0 ? trimmedQuery : undefined;
  const rawGameId = firstParam(params.gameId);
  const gameId = (rawGameId?.length ?? 0) > 0 ? rawGameId : undefined;

  const specialtiesRaw = firstParam(params.specialties);
  const specialties = specialtiesRaw
    ? specialtiesRaw
        .split(",")
        .filter((s): s is CoachSpecialty => SPECIALTY_SET.has(s))
    : undefined;

  const weekdaysRaw = firstParam(params.weekdays);
  const weekdays = weekdaysRaw
    ? weekdaysRaw
        .split(",")
        .map((s) => Number(s))
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    : undefined;

  const fromRaw = firstParam(params.from);
  const toRaw = firstParam(params.to);
  const fromMinute = fromRaw ? minutesFromTimeString(fromRaw) : undefined;
  const toMinute = toRaw ? minutesFromTimeString(toRaw) : undefined;

  const offsetRaw = firstParam(params.offset);
  const parsedOffset = offsetRaw ? Number(offsetRaw) : 0;
  const offset =
    Number.isFinite(parsedOffset) && parsedOffset > 0
      ? Math.floor(parsedOffset)
      : 0;

  return {
    query,
    gameId,
    specialties:
      specialties && specialties.length > 0 ? specialties : undefined,
    weekdays: weekdays && weekdays.length > 0 ? weekdays : undefined,
    fromMinute,
    toMinute,
    limit: PAGE_SIZE,
    offset,
  };
}

/** The initial game name for the picker (URL-only, not part of the tRPC input). */
export function parseInitialGameName(
  params: ParsedCoachSearchParams,
): string | null {
  const name = firstParam(params.gameName);
  return name && name.trim().length > 0 ? name : null;
}

/** Inverse of `parseCoachSearchParams` (+ game name) — builds the query string reflected in the URL. */
export function buildCoachSearchQueryString(filters: {
  query?: string;
  gameId?: string;
  gameName?: string;
  specialties?: CoachSpecialty[];
  weekdays?: number[];
  fromMinute?: number;
  toMinute?: number;
  offset: number;
}): string {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.gameId) params.set("gameId", filters.gameId);
  if (filters.gameName) params.set("gameName", filters.gameName);
  if (filters.specialties && filters.specialties.length > 0) {
    params.set("specialties", filters.specialties.join(","));
  }
  if (filters.weekdays && filters.weekdays.length > 0) {
    params.set("weekdays", filters.weekdays.join(","));
  }
  if (filters.fromMinute !== undefined) {
    params.set("from", timeStringFromMinutes(filters.fromMinute));
  }
  if (filters.toMinute !== undefined) {
    params.set("to", timeStringFromMinutes(filters.toMinute));
  }
  if (filters.offset > 0) params.set("offset", String(filters.offset));
  return params.toString();
}
