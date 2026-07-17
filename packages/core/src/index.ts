export type { ServiceCtx } from "./ctx";
export { assertCoachOf } from "./authz/assertCoachOf";
export { getAuthz } from "./authz/getAuthz";
export type { Authz } from "./authz/getAuthz";
export { requireActiveUser, requireRole } from "./authz/requireRole";
export type { CheckinRow } from "./checkins/dailyGuard";
export { createCheckin, createCheckinInput } from "./checkins/createCheckin";
export type { CreateCheckinInput } from "./checkins/createCheckin";
export { getTodayCheckinStatus } from "./checkins/getTodayStatus";
export type { TodayCheckinStatus } from "./checkins/getTodayStatus";
export { listCheckins, listCheckinsInput } from "./checkins/listCheckins";
export type {
  ListCheckinsInput,
  ListCheckinsResult,
} from "./checkins/listCheckins";
export {
  recordRewardEvent,
  recordRewardEventInput,
} from "./gamification/events";
export type { RecordRewardEventInput } from "./gamification/events";
export { xpForLevel, levelFromXp, levelProgress } from "./gamification/level";
export type { LevelProgress } from "./gamification/level";
export {
  getGamificationSummary,
  getGamificationSummaryInput,
  listAchievements,
  listRecentRewardEvents,
  listRecentRewardEventsInput,
} from "./gamification/queries";
export type {
  AchievementSummary,
  GamificationSummary,
  GetGamificationSummaryInput,
  ListRecentRewardEventsInput,
  RewardEventRow,
  StreakSummary,
} from "./gamification/queries";
export { requireUserId } from "./lib/auth";
export {
  addDaysToDateString,
  addMinutes,
  localDateString,
  zonedTimeToUtc,
} from "./lib/dates";
export type { CoreErrorCode } from "./lib/errors";
export { CoreError } from "./lib/errors";
export { buildLocalDateRange, daysInput } from "./dashboard/common";
export type { LocalDateRange } from "./dashboard/common";
export {
  getPlaytimeByDay,
  getPlaytimeByDayInput,
  zeroFillPlaytime,
} from "./dashboard/getPlaytimeByDay";
export type {
  GetPlaytimeByDayInput,
  PlaytimeByDay,
  RawPlaytimeDay,
} from "./dashboard/getPlaytimeByDay";
export {
  aggregateHabitCompletion,
  getHabitCompletionStats,
  getHabitCompletionStatsInput,
} from "./dashboard/getHabitCompletionStats";
export type {
  GetHabitCompletionStatsInput,
  HabitCompletionCountRow,
  HabitCompletionStats,
} from "./dashboard/getHabitCompletionStats";
export {
  getWellnessTrend,
  getWellnessTrendInput,
  zeroFillWellness,
} from "./dashboard/getWellnessTrend";
export type {
  GetWellnessTrendInput,
  RawWellnessDay,
  WellnessTrendDay,
} from "./dashboard/getWellnessTrend";
export {
  getPlaytimeVsWellness,
  getPlaytimeVsWellnessInput,
  mergePlaytimeAndMood,
} from "./dashboard/getPlaytimeVsWellness";
export type {
  GetPlaytimeVsWellnessInput,
  PlaytimeVsWellnessDay,
} from "./dashboard/getPlaytimeVsWellness";
export {
  HABIT_DEFINITIONS,
  HABIT_KINDS,
  habitKindSchema,
} from "./habits/definitions";
export type { HabitDefinition, HabitKind } from "./habits/definitions";
export { listHabits } from "./habits/listHabits";
export type { ListHabitsItem } from "./habits/listHabits";
export {
  respondToPrompt,
  respondToPromptInput,
} from "./habits/respondToPrompt";
export type {
  HabitPromptRow,
  RespondToPromptInput,
} from "./habits/respondToPrompt";
export {
  syncHabitPrompts,
  syncHabitPromptsInput,
} from "./habits/syncHabitPrompts";
export type {
  PendingHabitPrompt,
  SyncHabitPromptsInput,
} from "./habits/syncHabitPrompts";
export { upsertHabit, upsertHabitInput } from "./habits/upsertHabit";
export type { HabitRow, UpsertHabitInput } from "./habits/upsertHabit";
export { getOrCreateProfile } from "./profile/getOrCreateProfile";
export type { ProfileRow } from "./profile/getOrCreateProfile";
export { updateProfile, updateProfileInput } from "./profile/updateProfile";
export type { UpdateProfileInput } from "./profile/updateProfile";
export { deleteSession, deleteSessionInput } from "./sessions/deleteSession";
export type { DeleteSessionInput } from "./sessions/deleteSession";
export { getActiveSession } from "./sessions/getActiveSession";
export {
  getOrCreateGame,
  getOrCreateGameInput,
  searchGames,
  searchGamesInput,
} from "./sessions/games";
export type {
  GameRow,
  GetOrCreateGameInput,
  SearchGamesInput,
} from "./sessions/games";
export { listSessions, listSessionsInput } from "./sessions/listSessions";
export type {
  ListSessionsInput,
  ListSessionsResult,
} from "./sessions/listSessions";
export { logSession, logSessionInput } from "./sessions/logSession";
export type { LogSessionInput } from "./sessions/logSession";
export { startSession, startSessionInput } from "./sessions/startSession";
export type {
  GameSessionRow,
  StartSessionInput,
} from "./sessions/startSession";
export { stopSession, stopSessionInput } from "./sessions/stopSession";
export type { StopSessionInput } from "./sessions/stopSession";
export { assertValidSessionTimes } from "./sessions/time";
export { updateSession, updateSessionInput } from "./sessions/updateSession";
export type { UpdateSessionInput } from "./sessions/updateSession";
