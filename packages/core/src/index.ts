/**
 * Public surface of the domain layer.
 *
 * DELIBERATELY NOT EXPORTED: the explicit-user reader variants
 * (`listCheckinsFor`, `listSessionsFor`, `getGamificationSummaryFor`,
 * `queryHabitCompletionRaw`, `getProfileFor`). They take an arbitrary
 * `userId` and perform NO authorization — they exist so an already-
 * authorized caller (a coach-scoped service that ran `assertCoachOf` first)
 * can read a specific target user without re-authorizing per query.
 *
 * Everything exported here is reachable by the post-MVP AI assistant as a
 * Claude tool, so an unauthenticated whole-user reader on this surface would
 * let the assistant read any user's data by passing a different id. Import
 * them by relative path from inside `packages/core` only, immediately after
 * an authorization check.
 */
export type { ServiceCtx } from "./ctx";
export { ADMIN_AUDIT_ACTIONS, recordAdminAudit } from "./admin/audit";
export type { AdminAuditAction, RecordAdminAuditEntry } from "./admin/audit";
export { listUsers, listUsersInput } from "./admin/listUsers";
export type {
  ListUsersInput,
  ListUsersResult,
  ListUsersRow,
} from "./admin/listUsers";
export { setUserRole, setUserRoleInput } from "./admin/setUserRole";
export type { SetUserRoleInput, SetUserRoleResult } from "./admin/setUserRole";
export {
  setUserActivation,
  setUserActivationInput,
} from "./admin/setUserActivation";
export type {
  SetUserActivationInput,
  SetUserActivationResult,
} from "./admin/setUserActivation";
export {
  listAdminAuditLog,
  listAdminAuditLogInput,
} from "./admin/listAdminAuditLog";
export type {
  AdminAuditLogRow,
  ListAdminAuditLogInput,
} from "./admin/listAdminAuditLog";
export {
  listGamesAdmin,
  listGamesAdminInput,
} from "./admin/content/listGamesAdmin";
export type {
  ListGamesAdminInput,
  ListGamesAdminResult,
  ListGamesAdminRow,
} from "./admin/content/listGamesAdmin";
export { renameGame, renameGameInput } from "./admin/content/renameGame";
export type { RenameGameInput } from "./admin/content/renameGame";
export { mergeGames, mergeGamesInput } from "./admin/content/mergeGames";
export type {
  MergeGamesInput,
  MergeGamesResult,
} from "./admin/content/mergeGames";
export { deleteGame, deleteGameInput } from "./admin/content/deleteGame";
export type { DeleteGameInput } from "./admin/content/deleteGame";
export { listHabitDefinitionsAdmin } from "./admin/content/listHabitDefinitionsAdmin";
export type { HabitDefinitionAdminRow } from "./admin/content/listHabitDefinitionsAdmin";
export {
  createHabitDefinition,
  createHabitDefinitionInput,
} from "./admin/content/createHabitDefinition";
export type { CreateHabitDefinitionInput } from "./admin/content/createHabitDefinition";
export {
  updateHabitDefinition,
  updateHabitDefinitionInput,
} from "./admin/content/updateHabitDefinition";
export type { UpdateHabitDefinitionInput } from "./admin/content/updateHabitDefinition";
export {
  setHabitDefinitionArchived,
  setHabitDefinitionArchivedInput,
} from "./admin/content/setHabitDefinitionArchived";
export type { SetHabitDefinitionArchivedInput } from "./admin/content/setHabitDefinitionArchived";
export {
  deleteHabitDefinition,
  deleteHabitDefinitionInput,
} from "./admin/content/deleteHabitDefinition";
export type { DeleteHabitDefinitionInput } from "./admin/content/deleteHabitDefinition";
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
export { validateHabitConfig } from "./habits/validateHabitConfig";
export { queryHabitCompletionRaw } from "./habits/queryHabitCompletionRaw";
export type {
  HabitCompletionRawRow,
  NonPendingPromptStatus,
  QueryHabitCompletionRawParams,
} from "./habits/queryHabitCompletionRaw";
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
export {
  acceptCoachInvite,
  acceptCoachInviteInput,
} from "./invites/acceptCoachInvite";
export type { AcceptCoachInviteInput } from "./invites/acceptCoachInvite";
export {
  createCoachInvite,
  createCoachInviteInput,
} from "./invites/createCoachInvite";
export type {
  CoachInviteRow,
  CreateCoachInviteInput,
} from "./invites/createCoachInvite";
export {
  getCoachInviteByToken,
  getCoachInviteByTokenInput,
} from "./invites/getCoachInviteByToken";
export type {
  CoachInviteByToken,
  GetCoachInviteByTokenInput,
} from "./invites/getCoachInviteByToken";
export {
  listCoachInvites,
  listCoachInvitesInput,
} from "./invites/listCoachInvites";
export type {
  ListCoachInvitesInput,
  ListCoachInvitesItem,
} from "./invites/listCoachInvites";
export {
  revokeCoachInvite,
  revokeCoachInviteInput,
} from "./invites/revokeCoachInvite";
export type { RevokeCoachInviteInput } from "./invites/revokeCoachInvite";
export { coachInviteStatus } from "./invites/status";
export type { CoachInviteStatus } from "./invites/status";
export {
  buildCoachProfileDetail,
  ensureCoachProfileRow,
  fetchCoachIdentity,
  getOrCreateCoachProfile,
} from "./coaching/profile/getOrCreateCoachProfile";
export type {
  AvailabilityBlock,
  CoachProfileDetail,
  CoachProfileRow,
} from "./coaching/profile/getOrCreateCoachProfile";
export {
  updateCoachProfile,
  updateCoachProfileInput,
} from "./coaching/profile/updateCoachProfile";
export type { UpdateCoachProfileInput } from "./coaching/profile/updateCoachProfile";
export {
  setCoachPublished,
  setCoachPublishedInput,
} from "./coaching/profile/setCoachPublished";
export type { SetCoachPublishedInput } from "./coaching/profile/setCoachPublished";
export {
  setCoachAcceptingApplications,
  setCoachAcceptingApplicationsInput,
} from "./coaching/profile/setCoachAcceptingApplications";
export type { SetCoachAcceptingApplicationsInput } from "./coaching/profile/setCoachAcceptingApplications";
export {
  setCoachGames,
  setCoachGamesInput,
} from "./coaching/profile/setCoachGames";
export type { SetCoachGamesInput } from "./coaching/profile/setCoachGames";
export {
  availabilityBlockInput,
  setCoachAvailability,
  setCoachAvailabilityInput,
} from "./coaching/profile/setCoachAvailability";
export type {
  AvailabilityBlockInput,
  SetCoachAvailabilityInput,
} from "./coaching/profile/setCoachAvailability";
export {
  getCoachAvailability,
  getCoachAvailabilityInput,
} from "./coaching/profile/getCoachAvailability";
export type { GetCoachAvailabilityInput } from "./coaching/profile/getCoachAvailability";
export {
  getPublicCoachProfile,
  getPublicCoachProfileInput,
} from "./coaching/profile/getPublicCoachProfile";
export type { GetPublicCoachProfileInput } from "./coaching/profile/getPublicCoachProfile";

// --- Coach discovery & application (#10) ------------------------------------
export {
  isCoachDiscoverable,
  publishedCoachWhere,
} from "./coaching/discovery/publishedCoachWhere";
export {
  searchCoaches,
  searchCoachesInput,
} from "./coaching/discovery/searchCoaches";
export type {
  CoachSearchRow,
  SearchCoachesInput,
  SearchCoachesResult,
} from "./coaching/discovery/searchCoaches";
export {
  applyToCoach,
  applyToCoachInput,
} from "./coaching/discovery/applyToCoach";
export type {
  ApplyToCoachInput,
  ApplyToCoachResult,
} from "./coaching/discovery/applyToCoach";
export {
  withdrawApplication,
  withdrawApplicationInput,
} from "./coaching/discovery/withdrawApplication";
export type { WithdrawApplicationInput } from "./coaching/discovery/withdrawApplication";
export { listMyApplications } from "./coaching/discovery/listMyApplications";
export type { MyApplicationRow } from "./coaching/discovery/listMyApplications";

// --- Coaching relationships & roster (#11) ----------------------------------
export {
  findActiveRelationship,
  requireMyCoachRelationship,
} from "./coaching/relationships/getActiveRelationship";
export type { CoachingRelationshipRow } from "./coaching/relationships/getActiveRelationship";
export {
  acceptCoachApplication,
  acceptCoachApplicationInput,
} from "./coaching/relationships/acceptCoachApplication";
export type { AcceptCoachApplicationInput } from "./coaching/relationships/acceptCoachApplication";
export {
  declineCoachApplication,
  declineCoachApplicationInput,
} from "./coaching/relationships/declineCoachApplication";
export type { DeclineCoachApplicationInput } from "./coaching/relationships/declineCoachApplication";
export {
  endCoachingRelationship,
  endCoachingRelationshipInput,
} from "./coaching/relationships/endCoachingRelationship";
export type { EndCoachingRelationshipInput } from "./coaching/relationships/endCoachingRelationship";
export {
  listCoachRoster,
  listCoachRosterInput,
} from "./coaching/relationships/listCoachRoster";
export type {
  ListCoachRosterInput,
  RosterEntry,
} from "./coaching/relationships/listCoachRoster";
export { getMyCoach } from "./coaching/relationships/getMyCoach";
export type { MyCoachSummary } from "./coaching/relationships/getMyCoach";

// --- Coach player progress tracking (#12) -----------------------------------
export {
  getCoachPlayerOverview,
  getCoachPlayerOverviewInput,
} from "./coaching/players/getCoachPlayerOverview";
export type {
  CoachPlayerOverview,
  GetCoachPlayerOverviewInput,
} from "./coaching/players/getCoachPlayerOverview";
export {
  listCoachPlayerSessions,
  listCoachPlayerSessionsInput,
} from "./coaching/players/listCoachPlayerSessions";
export type { ListCoachPlayerSessionsInput } from "./coaching/players/listCoachPlayerSessions";
export {
  listCoachPlayerCheckins,
  listCoachPlayerCheckinsInput,
} from "./coaching/players/listCoachPlayerCheckins";
export type { ListCoachPlayerCheckinsInput } from "./coaching/players/listCoachPlayerCheckins";

// --- Goals (#13) -------------------------------------------------------------
export type { GoalListItem, GoalRow } from "./coaching/goals/common";
export { createGoal, createGoalInput } from "./coaching/goals/createGoal";
export type { CreateGoalInput } from "./coaching/goals/createGoal";
export { updateGoal, updateGoalInput } from "./coaching/goals/updateGoal";
export type { UpdateGoalInput } from "./coaching/goals/updateGoal";
export {
  setGoalStatus,
  setGoalStatusInput,
} from "./coaching/goals/setGoalStatus";
export type { SetGoalStatusInput } from "./coaching/goals/setGoalStatus";
export {
  updateGoalProgress,
  updateGoalProgressInput,
} from "./coaching/goals/updateGoalProgress";
export type { UpdateGoalProgressInput } from "./coaching/goals/updateGoalProgress";
export { deleteGoal, deleteGoalInput } from "./coaching/goals/deleteGoal";
export type { DeleteGoalInput } from "./coaching/goals/deleteGoal";
export { listMyGoals, listMyGoalsInput } from "./coaching/goals/listMyGoals";
export type { ListMyGoalsInput } from "./coaching/goals/listMyGoals";
export {
  listPlayerGoals,
  listPlayerGoalsInput,
} from "./coaching/goals/listPlayerGoals";
export type { ListPlayerGoalsInput } from "./coaching/goals/listPlayerGoals";
export { getRosterGoalSummary } from "./coaching/goals/getRosterGoalSummary";
export type { RosterGoalSummaryRow } from "./coaching/goals/getRosterGoalSummary";

// Coach habit assignment (#14, docs/features/coach-habit-assignment.md).
export {
  createCoachHabitDefinition,
  createCoachHabitDefinitionInput,
} from "./coaching/habits/createCoachHabitDefinition";
export type { CreateCoachHabitDefinitionInput } from "./coaching/habits/createCoachHabitDefinition";
export {
  updateCoachHabitDefinition,
  updateCoachHabitDefinitionInput,
} from "./coaching/habits/updateCoachHabitDefinition";
export type { UpdateCoachHabitDefinitionInput } from "./coaching/habits/updateCoachHabitDefinition";
export {
  setCoachHabitDefinitionArchived,
  setCoachHabitDefinitionArchivedInput,
} from "./coaching/habits/setCoachHabitDefinitionArchived";
export type { SetCoachHabitDefinitionArchivedInput } from "./coaching/habits/setCoachHabitDefinitionArchived";
export { listCoachHabitDefinitions } from "./coaching/habits/listCoachHabitDefinitions";
export type { CoachHabitDefinitionRow } from "./coaching/habits/listCoachHabitDefinitions";
export { listAssignableHabitDefinitions } from "./coaching/habits/listAssignableHabitDefinitions";
export {
  assignHabitToPlayer,
  assignHabitToPlayerInput,
} from "./coaching/habits/assignHabitToPlayer";
export type { AssignHabitToPlayerInput } from "./coaching/habits/assignHabitToPlayer";
export {
  unassignHabitFromPlayer,
  unassignHabitFromPlayerInput,
} from "./coaching/habits/unassignHabitFromPlayer";
export type { UnassignHabitFromPlayerInput } from "./coaching/habits/unassignHabitFromPlayer";
export {
  listPlayerHabitsForCoach,
  listPlayerHabitsForCoachInput,
} from "./coaching/habits/listPlayerHabitsForCoach";
export type {
  CoachPlayerHabitRow,
  ListPlayerHabitsForCoachInput,
} from "./coaching/habits/listPlayerHabitsForCoach";
