import type { Curriculum } from '../../learning/curriculum';
import { LearningTracker } from '../../learning/LearningTracker';
import { buildProgressReport, type ProgressReport } from '../../learning/report';
import type { LearningContent } from '../../learning/types';
import { balance, sanitizeRewardState } from '../../rewards/economy';
import { dayKey, type ProfileData } from '../../storage/StorageManager';

/** Play over a stretch of days. */
export interface ActivityTotals {
  readonly days: number;
  readonly questions: number;
  readonly firstTry: number;
  readonly minutes: number;
}

/** One child's card on the grown-ups' dashboard. */
export interface ChildSummary {
  readonly id: string;
  readonly name: string;
  readonly avatar: string;
  readonly stars: number;
  /** Whole days since they last played (0 = today), or null if never. */
  readonly daysSincePlayed: number | null;
  /** The skill being learnt now, or null when the journey is done (or not started). */
  readonly nowLearning: string | null;
  readonly skillsPassed: number;
  readonly skillCount: number;
  /** The last 7 days, including today, and the 7 before that. */
  readonly thisWeek: ActivityTotals;
  readonly lastWeek: ActivityTotals;
  /** Questions answered on each of the last 14 days, oldest first. */
  readonly recent: readonly { readonly day: string; readonly questions: number }[];
  /** A few facts that most need practice, in readable words. */
  readonly needsPractice: readonly string[];
  readonly report: ProgressReport;
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const RECENT_DAYS = 14;

/** The local day `n` days before `now`'s (robust to clock changes: steps by calendar day). */
function dayBefore(now: number, n: number): string {
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return dayKey(d.getTime());
}

function totals(profile: ProfileData, days: readonly string[]): ActivityTotals {
  let played = 0;
  let questions = 0;
  let firstTry = 0;
  let ms = 0;
  for (const day of days) {
    const a = profile.activity[day];
    if (!a || (a.questions === 0 && a.ms === 0)) continue;
    played++;
    questions += a.questions;
    firstTry += a.firstTry;
    ms += a.ms;
  }
  return { days: played, questions, firstTry, minutes: Math.round(ms / 60000) };
}

export function summarizeChild(
  profile: ProfileData,
  index: number,
  content: LearningContent,
  curriculum: Curriculum,
  otherUnitIds: readonly string[],
  now = Date.now(),
): ChildSummary {
  const report = buildProgressReport(new LearningTracker(profile.learning), content, curriculum, otherUnitIds);
  const lastDays = Array.from({ length: RECENT_DAYS }, (_, i) => dayBefore(now, RECENT_DAYS - 1 - i));
  const playedDays = Object.entries(profile.activity)
    .filter(([, a]) => a.questions > 0 || a.ms > 0)
    .map(([day]) => day)
    .sort();
  const last = playedDays.at(-1);
  let daysSincePlayed: number | null = null;
  if (last) {
    const [y, m, d] = last.split('-').map(Number);
    const today = new Date(now);
    daysSincePlayed = Math.max(0, Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() - new Date(y, m - 1, d).getTime()) / DAY_MS));
  }
  const learning = report.stages.flatMap((s) => s.skills).find((s) => s.status === 'learning');
  const started = report.unaidedAnswers > 0 || report.skillsPassed > 0;
  return {
    id: profile.id,
    name: profile.name || `Player ${index + 1}`,
    avatar: profile.avatar,
    stars: balance(sanitizeRewardState(profile.rewards)),
    daysSincePlayed,
    nowLearning: learning && started ? learning.title : null,
    skillsPassed: report.skillsPassed,
    skillCount: report.skillCount,
    thisWeek: totals(profile, lastDays.slice(-7)),
    lastWeek: totals(profile, lastDays.slice(0, 7)),
    recent: lastDays.map((day) => ({ day, questions: profile.activity[day]?.questions ?? 0 })),
    needsPractice: report.practice.filter((p) => p.reason !== 'rusty').slice(0, 3).map((p) => p.label),
    report,
  };
}
