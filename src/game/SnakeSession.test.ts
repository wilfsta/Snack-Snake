import { describe, expect, it } from 'vitest';
import { DIRECTIONS, isOpposite, type Direction } from '../core/geometry';
import { seededRng } from '../core/random';
import type { Challenge, ChallengeEvent, ChallengeSource, ChallengeStage } from '../learning/types';
import { planMove } from './collision';
import { buildRules, CLASSIC_RULES, LEARN_RULES, PLAY_RULES, sanitizeOptions } from './modes';
import { SnakeSession, type SessionEvent } from './SnakeSession';
import type { Tile } from './tiles';

/** A deliberately non-maths source: the game must not care what the challenge is about. */
class FakeSource implements ChallengeSource {
  readonly events: ChallengeEvent[] = [];
  private n = 0;
  constructor(
    private readonly stage: ChallengeStage = 'independent',
    private readonly limit = Infinity,
  ) {}
  next(): Challenge {
    this.n++;
    return {
      id: `c${this.n}`,
      itemId: 'colour:red',
      category: 'colours',
      prompt: 'RED?',
      statement: 'RED = rouge',
      correctAnswer: { id: 'ok', label: 'rouge' },
      distractors: ['bleu', 'vert', 'jaune', 'noir'].map((label) => ({ id: label, label })),
      difficulty: 0.5,
      stage: this.stage,
      hintStrength: this.stage === 'guided' ? 1 : 0,
      metadata: {},
    };
  }
  record(event: ChallengeEvent): void {
    this.events.push(event);
  }
  isSessionComplete(): boolean {
    return this.events.filter((e) => e.type === 'completed').length >= this.limit;
  }
}

function makeSession(rules = PLAY_RULES, source = new FakeSource()) {
  const events: SessionEvent[] = [];
  const session = new SnakeSession({ rules, source, cols: 20, rows: 13, rng: seededRng(12), onEvent: (e) => events.push(e) });
  session.start();
  return { session, events, source };
}

/** Steers greedily toward a tile, avoiding reversals and self-collisions, one grid step at a time. */
function steerTo(session: SnakeSession, target: Tile, maxSteps = 200): void {
  const startPhase = session.phase.kind;
  for (let i = 0; i < maxSteps && session.phase.kind === startPhase; i++) {
    const head = session.snake.head;
    const goal = { x: target.x, y: target.y };
    const current = session.snake.direction;
    const options = DIRECTIONS.filter((d) => !isOpposite(d, current) && planMove(session.snake, session.arena, d).kind === 'move');
    let best: Direction = options[0] ?? current;
    let bestDist = Infinity;
    for (const d of options) {
      const next = session.arena.next(head, d)!;
      const dist = session.arena.distance(next, goal);
      // Avoid touching other tiles on the way.
      const hitsOther = session.tiles.some((t) => t !== target && next.x >= t.x && next.x < t.x + t.w && next.y >= t.y && next.y < t.y + t.h);
      const score = dist + (hitsOther ? 100 : 0);
      if (score < bestDist) {
        bestDist = score;
        best = d;
      }
    }
    if (best !== current) session.steer(best);
    session.update(session.stepMs);
  }
}

function steerToFood(session: SnakeSession): void {
  const target = session.tiles[0];
  const eaten = session.score.correct;
  for (let i = 0; i < 300 && session.score.correct === eaten; i++) {
    const head = session.snake.head;
    const current = session.snake.direction;
    const options = DIRECTIONS.filter((d) => !isOpposite(d, current) && planMove(session.snake, session.arena, d).kind === 'move');
    let best: Direction = options[0] ?? current;
    let bestDist = Infinity;
    for (const d of options) {
      const dist = session.arena.distance(session.arena.next(head, d)!, target);
      if (dist < bestDist) {
        bestDist = dist;
        best = d;
      }
    }
    if (best !== current) session.steer(best);
    session.update(session.stepMs);
  }
}

function waitFor(session: SnakeSession, kind: string, maxMs = 10000): void {
  for (let t = 0; t < maxMs && session.phase.kind !== kind; t += 10) session.update(10);
}

describe('options', () => {
  it('falls back to safe defaults for bad values', () => {
    expect(sanitizeOptions({ speed: 99, walls: 'lava' as never, answerCount: 1 })).toEqual({ speed: 2, walls: 'wrap', answerCount: 5 });
    expect(sanitizeOptions({ speed: 0, walls: 'solid', answerCount: 6 })).toEqual({ speed: 0, walls: 'solid', answerCount: 6 });
  });

  it('slower speed settings mean more time per step', () => {
    expect(buildRules('play', { speed: 0, walls: 'wrap', answerCount: 5 }).baseStepMs).toBeGreaterThan(
      buildRules('play', { speed: 4, walls: 'wrap', answerCount: 5 }).baseStepMs,
    );
  });
});

describe('SnakeSession', () => {
  it('starts with a ready countdown and exactly one question tile', () => {
    const { session } = makeSession();
    expect(session.phase.kind).toBe('ready');
    expect(session.tiles).toHaveLength(1);
    expect(session.tiles[0].kind).toBe('question');
    waitFor(session, 'seek');
    expect(session.phase.kind).toBe('seek');
  });

  it('eating the question shows five answers with exactly one correct', () => {
    const { session, events } = makeSession();
    waitFor(session, 'seek');
    steerTo(session, session.tiles[0]);
    expect(session.phase.kind).toBe('swallow');
    expect(events.some((e) => e.type === 'questionEaten')).toBe(true);
    expect(session.tiles).toHaveLength(5);
    expect(session.tiles.filter((t) => t.isCorrect)).toHaveLength(1);
    expect(new Set(session.tiles.map((t) => t.label)).size).toBe(5);
    for (const tile of session.tiles) {
      for (const cell of session.snake.body) {
        const inside = cell.x >= tile.x && cell.x < tile.x + tile.w && cell.y >= tile.y && cell.y < tile.y + tile.h;
        expect(inside).toBe(false);
      }
    }
    waitFor(session, 'answer');
    expect(session.phase.kind).toBe('answer');
  });

  it('a correct answer scores, grows the snake and brings the next question', () => {
    const { session, events, source } = makeSession();
    waitFor(session, 'seek');
    steerTo(session, session.tiles[0]);
    waitFor(session, 'answer');
    const lengthBefore = session.snake.length;
    steerTo(session, session.tiles.find((t) => t.isCorrect)!);
    expect(events.some((e) => e.type === 'correct')).toBe(true);
    expect(session.score.score).toBeGreaterThan(0);
    expect(session.score.streak).toBe(1);
    expect(session.tiles).toHaveLength(0);
    expect(source.events.some((e) => e.type === 'answered' && e.correct)).toBe(true);
    waitFor(session, 'seek');
    expect(session.snake.length).toBe(lengthBefore + 1);
    expect(session.tiles).toHaveLength(1);
  });

  it('PLAY: a wrong answer reveals the right one and ends the game', () => {
    const { session, events } = makeSession(PLAY_RULES);
    waitFor(session, 'seek');
    steerTo(session, session.tiles[0]);
    waitFor(session, 'answer');
    steerTo(session, session.tiles.find((t) => !t.isCorrect)!);
    expect(session.phase.kind).toBe('dying');
    expect(session.tiles.find((t) => t.isCorrect)?.mark).toBe('correct');
    expect(session.tiles.find((t) => !t.isCorrect)?.mark).toBe('wrong');
    waitFor(session, 'over');
    const over = events.find((e) => e.type === 'gameOver');
    expect(over && over.type === 'gameOver' && over.info.cause).toBe('wrong-answer');
    expect(over && over.type === 'gameOver' && over.info.challenge?.correctAnswer.label).toBe('rouge');
  });

  it('LEARN: a wrong answer is forgiven, the hint grows, and the snake carries on', () => {
    const { session, events } = makeSession(LEARN_RULES, new FakeSource('independent'));
    waitFor(session, 'seek');
    steerTo(session, session.tiles[0]);
    waitFor(session, 'answer');
    steerTo(session, session.tiles.find((t) => !t.isCorrect)!);
    expect(session.phase.kind).toBe('reaction');
    expect(session.tiles).toHaveLength(4);
    expect(session.tiles.find((t) => t.isCorrect)!.hint).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'wrong' && !e.fatal)).toBe(true);
    waitFor(session, 'answer');
    steerTo(session, session.tiles.find((t) => t.isCorrect)!);
    expect(events.some((e) => e.type === 'correct' && !e.firstTry)).toBe(true);
  });

  it('LEARN: an introduction tile teaches the fact and cannot be got wrong', () => {
    const source = new FakeSource('introduce');
    const { session, events } = makeSession(LEARN_RULES, source);
    expect(session.tiles[0].kind).toBe('fact');
    expect(session.tiles[0].label).toBe('RED = rouge');
    waitFor(session, 'seek');
    steerTo(session, session.tiles[0]);
    expect(session.phase.kind).toBe('teach');
    expect(events.some((e) => e.type === 'factCollected')).toBe(true);
    expect(source.events.map((e) => e.type)).toEqual(['introduced', 'completed']);
    // Mashing the button straight away can't skip the fact before it has been seen...
    session.skipTeaching();
    session.update(1);
    expect(session.phase.kind).toBe('teach');
    // ...but after the minimum viewing time it can.
    session.update(1800);
    session.skipTeaching();
    session.update(1);
    expect(session.phase.kind).toBe('transition');
  });

  it('LEARN: the session completes when the learning source says so', () => {
    const { session, events } = makeSession(LEARN_RULES, new FakeSource('introduce', 1));
    waitFor(session, 'seek');
    steerTo(session, session.tiles[0]);
    session.skipTeaching();
    waitFor(session, 'complete');
    expect(events.some((e) => e.type === 'sessionComplete')).toBe(true);
  });

  it('PLAY: running into itself ends the game', () => {
    const { session } = makeSession(PLAY_RULES);
    waitFor(session, 'seek');
    session.snake.grow(6);
    for (let i = 0; i < 6; i++) session.update(session.stepMs);
    // Tight square turn: up, left, down -> bites own body.
    for (const d of ['up', 'left', 'down'] as Direction[]) {
      session.steer(d);
      session.update(session.stepMs);
    }
    expect(['dying', 'over']).toContain(session.phase.kind);
  });

  it('CLASSIC: eating food grows the snake, scores and spawns the next snack', () => {
    const events: SessionEvent[] = [];
    const session = new SnakeSession({ rules: CLASSIC_RULES, cols: 20, rows: 13, rng: seededRng(3), onEvent: (e) => events.push(e) });
    session.start();
    expect(session.tiles).toHaveLength(1);
    expect(session.tiles[0].kind).toBe('food');
    waitFor(session, 'seek');
    const before = session.snake.length;
    for (let i = 0; i < 3; i++) steerToFood(session);
    expect(events.filter((e) => e.type === 'foodEaten')).toHaveLength(3);
    expect(session.score.score).toBe(30);
    expect(session.tiles).toHaveLength(1);
    session.update(session.stepMs * 3);
    expect(session.snake.length).toBe(before + 3);
    expect(session.stepMs).toBeLessThan(CLASSIC_RULES.baseStepMs);
  });

  it('solid walls end the game when the option is on', () => {
    const rules = buildRules('play', { speed: 2, walls: 'solid', answerCount: 5 });
    const { session, events } = makeSession(rules);
    waitFor(session, 'seek');
    session.steer('up');
    for (let i = 0; i < 20 && !session.isFinished && session.phase.kind !== 'dying'; i++) session.update(session.stepMs);
    expect(['dying', 'over']).toContain(session.phase.kind);
    expect(events.some((e) => e.type === 'died' && e.cause === 'wall')).toBe(true);
  });

  it('shows as many answers as the challenge offers', () => {
    const source = new FakeSource();
    const original = source.next.bind(source);
    source.next = () => ({ ...original(), distractors: [{ id: 'bleu', label: 'bleu' }] });
    const { session } = makeSession(PLAY_RULES, source);
    waitFor(session, 'seek');
    steerTo(session, session.tiles[0]);
    expect(session.tiles).toHaveLength(2);
  });

  it('LEARN: biting its own body just trims the tail', () => {
    const { session, events } = makeSession(LEARN_RULES);
    waitFor(session, 'seek');
    session.snake.grow(6);
    for (let i = 0; i < 6; i++) session.update(session.stepMs);
    const before = session.snake.length;
    for (const d of ['up', 'left', 'down'] as Direction[]) {
      session.steer(d);
      session.update(session.stepMs);
    }
    expect(events.some((e) => e.type === 'selfBite')).toBe(true);
    expect(session.snake.length).toBeLessThan(before);
    expect(session.isFinished).toBe(false);
  });
});
