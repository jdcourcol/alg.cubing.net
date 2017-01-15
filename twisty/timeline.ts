"use strict";

namespace Twisty {

export class Timeline implements Timeline.BreakPointModel {
  constructor(public alg: Alg.Algorithm) {
  }

  firstBreakPoint(): Timeline.Duration {
    return 0;
  }

  lastBreakPoint(): Timeline.Duration {
    // TODO: Bind once to Timeline namespace.
    var durFn = new Timeline.AlgDuration(Timeline.DefaultDurationForAmount);
    return durFn.traverse(this.alg);
  }

  // TODO: Define semantics if `duration` is past the end.
  breakPoint(direction: Timeline.Direction, breakPointType: Timeline.BreakPointType, duration: Timeline.Duration): Timeline.Duration {
    if (breakPointType === Timeline.BreakPointType.EntireMoveSequence) {
      if (direction === Timeline.Direction.Backwards) {
        return this.firstBreakPoint();
      } else {
        return this.lastBreakPoint();
      }
    }

    // TODO: Bind once to Timeline namespace.
    var durFn = new Timeline.AlgDuration(Timeline.DefaultDurationForAmount);
    var posFn = new Timeline.AlgPosition(durFn);
    var dirCur = new Timeline.DirectionWithCursor(Timeline.Direction.Forwards, duration);
    var pos = posFn.traverse(this.alg, dirCur);
    if (pos === null) {
      throw "Invalid position calculated." // TODO
    }
    // TODO: Make this less hacky.
    if (direction === Timeline.Direction.Forwards && duration < this.lastBreakPoint()) {
      if (pos.fraction === 1) {
        return this.breakPoint(direction, breakPointType, duration + 0.1);
      }
    }
    // TODO: Make sure that AlgPosition returns the right move.
    if (direction === Timeline.Direction.Backwards && duration > this.firstBreakPoint()) {
      if (pos.fraction === 0) {
        return this.breakPoint(direction, breakPointType, duration - 0.1);
      }
    }

    // TODO: Make this less hacky.
    var frac = pos.fraction;
    if (pos.dir === Timeline.Direction.Backwards) {
      frac = 1 - pos.fraction
    }
    if (pos.dir === direction) {
      return duration + pos.dir * durFn.traverse(pos.part) * (1 - frac);
    } else {
      return duration - pos.dir * durFn.traverse(pos.part) * frac;
    }
  }
}

export namespace Timeline {

// The values are animation scaling factors.
// TODO: "Paused" is more of an Anim concept. Can we get it out of the Timeline
// namespace in a natural way?
export enum Direction {
  Forwards = 1,
  Paused = 0,
  Backwards = -1
}

export function CombineDirections(d1: Direction, d2: Direction): Direction {
  return d1 * d2;
}

export enum BreakPointType {
  Move,
  EntireMoveSequence
}

// TODO: Extend `number`, introduce MoveSequenceTimeStamp vs. EpochTimeStamp,
// force Duration to be a difference.
export type Duration = number; // Duration in milliseconds
export type TimeStamp = Duration; // Duration since a particular epoch.

export type Fraction = number; // Value from 0 to 1.

// TODO: Handle different types of breakpoints:
// - Move
// - Line
// - Start/end of move sequence.
// - "section" (e.g. scramble section, solve section)
export interface BreakPointModel {
  firstBreakPoint(): Duration;
  lastBreakPoint(): Duration;
  // TODO: Define semantics if `duration` is past the end.
  breakPoint(direction: Direction, breakPointType: BreakPointType, duration: Duration): Duration;
}

export class SimpleBreakPoints implements BreakPointModel {
    // Assumes breakPointList is sorted.
    constructor(private breakPointList: Duration[]) {}

    firstBreakPoint() {
      return this.breakPointList[0];
    }
    lastBreakPoint() {
      return this.breakPointList[this.breakPointList.length - 1];
    }

    breakPoint(direction: Direction, breakPointType: BreakPointType, duration: Duration) {
      if (direction === Direction.Backwards) {
        var l = this.breakPointList.filter(d2 => d2 < duration);
        if (l.length === 0 || breakPointType === BreakPointType.EntireMoveSequence) {
          // TODO: Avoid list filtering above if breakPointType == EntireMoveSequence
          return this.firstBreakPoint();
        }
        return l[l.length - 1];
      } else {
        var l = this.breakPointList.filter(d2 => d2 > duration);
        if (l.length === 0 || breakPointType === BreakPointType.EntireMoveSequence) {
          // TODO: Avoid list filtering above if breakPointType == EntireMoveSequence
          return this.lastBreakPoint();
        }
        return l[0];
      }
    }
}

export class AlgDuration extends Alg.Traversal.Up<Timeline.Duration> {
  // TODO: Pass durationForAmount as Down type instead?
  constructor(public durationForAmount = DefaultDurationForAmount) {
    super()
  }

  public traverseSequence(sequence: Alg.Sequence):             Timeline.Duration {
    var total = 0;
    for (var alg of sequence.nestedAlgs) {
      total += this.traverse(alg)
    }
    return total;
  }
  public traverseGroup(group: Alg.Group):                      Timeline.Duration { return group.amount * this.traverse(group.nestedAlg); }
  public traverseBlockMove(blockMove: Alg.BlockMove):          Timeline.Duration { return this.durationForAmount(blockMove.amount); }
  public traverseCommutator(commutator: Alg.Commutator):       Timeline.Duration { return commutator.amount * 2 * (this.traverse(commutator.A) + this.traverse(commutator.B)); }
  public traverseConjugate(conjugate: Alg.Conjugate):          Timeline.Duration { return conjugate.amount * (2 * this.traverse(conjugate.A) + this.traverse(conjugate.B)); }
  public traversePause(pause: Alg.Pause):                      Timeline.Duration { return this.durationForAmount(1); }
  public traverseNewLine(newLine: Alg.NewLine):                Timeline.Duration { return this.durationForAmount(1); }
  public traverseCommentShort(commentShort: Alg.CommentShort): Timeline.Duration { return this.durationForAmount(0); }
  public traverseCommentLong(commentLong: Alg.CommentLong):    Timeline.Duration { return this.durationForAmount(0); }
}

// TODO: Encapsulate
export class Position {
  constructor(public part: Alg.Algorithm, public dir: Timeline.Direction, public fraction: Fraction) {}
}

// TODO: Encapsulate
class PartWithDirection {
  constructor(public part: Alg.Algorithm, public direction: Timeline.Direction) {}
}

// TODO: Encapsulate
export class DirectionWithCursor {
  constructor(public dir: Timeline.Direction,
              public cursor: Timeline.Duration) {}
}

export class AlgPosition extends Alg.Traversal.DownUp<DirectionWithCursor, Position | null> {
  public cursor: Timeline.Duration = 0

  constructor(public algDuration = new AlgDuration()) {
    super();
  }

  // TODO: Better name
  private leaf(algorithm: Alg.Algorithm, dirCur: DirectionWithCursor): Position | null {
    return new Position(algorithm, dirCur.dir, dirCur.cursor/ this.algDuration.traverse(algorithm));
  }

  private traversePartsWithDirections(partsWithDirections: PartWithDirection[], amount: number, dirCur: DirectionWithCursor): Position | null {
    // TODO: Use generators once TypeScript is less buggy with them.
    var iterList = dirCur.dir === Timeline.Direction.Forwards ?
                       partsWithDirections :
                       partsWithDirections.slice(0).reverse();

    var singleIterationTotal = 0;
    for (var partWithDirection of iterList) {
      // TODO: Dedup this calculation with the final loop?
      singleIterationTotal += this.algDuration.traverse(partWithDirection.part);
    }
    var numFullIterations = Math.floor(dirCur.cursor / singleIterationTotal);

    var cursorRemaining = dirCur.cursor - numFullIterations * singleIterationTotal;
    // TODO: Use division/interpolation to handle large amounts efficiently.
    for (var i = 0; i < amount; i++) {
      for (var partWithDirection of iterList) {
          var duration = this.algDuration.traverse(partWithDirection.part);
          // TODO: keep the move transition either on the rising edge or the falling edge, from the "forward" perspective.
          if (cursorRemaining <= duration) {
            var newDir = Timeline.CombineDirections(dirCur.dir, partWithDirection.direction);
            var newDirCur = new DirectionWithCursor(newDir, cursorRemaining);
            return this.traverse(partWithDirection.part, newDirCur);
          }
          cursorRemaining -= duration;
      }
    }
    return null;
  }

  public traverseSequence(sequence: Alg.Sequence, dirCur: DirectionWithCursor): Position | null {
    var p = sequence.nestedAlgs.map(part => new PartWithDirection(part, Timeline.Direction.Forwards));
    return this.traversePartsWithDirections(p, 1, dirCur);
  }
  public traverseGroup(group: Alg.Group, dirCur: DirectionWithCursor): Position | null {
    return this.traverse(group.nestedAlg, dirCur);}
  public traverseBlockMove(blockMove: Alg.BlockMove, dirCur: DirectionWithCursor): Position | null {
    return this.leaf(blockMove, dirCur); }
  public traverseCommutator(commutator: Alg.Commutator, dirCur: DirectionWithCursor): Position | null {
    return this.traversePartsWithDirections([
      new PartWithDirection(commutator.A, Timeline.Direction.Forwards),
      new PartWithDirection(commutator.B, Timeline.Direction.Forwards),
      new PartWithDirection(commutator.A, Timeline.Direction.Backwards),
      new PartWithDirection(commutator.B, Timeline.Direction.Backwards)
    ], commutator.amount, dirCur);
  }
  public traverseConjugate(conjugate: Alg.Conjugate, dirCur: DirectionWithCursor): Position | null {
    return this.traversePartsWithDirections([
      new PartWithDirection(conjugate.A, Timeline.Direction.Forwards),
      new PartWithDirection(conjugate.B, Timeline.Direction.Forwards),
      new PartWithDirection(conjugate.A, Timeline.Direction.Backwards)
    ], conjugate.amount, dirCur);
  }
  public traversePause(pause: Alg.Pause, dirCur: DirectionWithCursor): Position | null {
    return this.leaf(pause, dirCur); }
  public traverseNewLine(newLine: Alg.NewLine, dirCur: DirectionWithCursor): Position | null {
    return this.leaf(newLine, dirCur); }
  public traverseCommentShort(commentShort: Alg.CommentShort, dirCur: DirectionWithCursor): Position | null {
    return null; }
  public traverseCommentLong(commentLong: Alg.CommentLong, dirCur: DirectionWithCursor): Position | null {
    return null; }
}

export type DurationForAmount = (amount: number) => Timeline.Duration;

export function ConstantDurationForAmount(amount: number): Timeline.Duration {
  return 1000;
}

export function DefaultDurationForAmount(amount: number): Timeline.Duration {
  switch (Math.abs(amount)) {
    case 0:
      return 0;
    case 1:
      return 1000;
    case 2:
      return 1500;
    default:
      return 2000;
  }
}

}
// var t = new Timeline();
// t.alg = exampleAlg;
// console.log(t.breakPoint(Timeline.Direction.Forwards, Timeline.BreakPointType.Move, 10));
// console.log(t.breakPoint(Timeline.Direction.Backwards, Timeline.BreakPointType.Move, 10));
// console.log(t.breakPoint(Timeline.Direction.Backwards, Timeline.BreakPointType.Move, 1300));
// console.log(t.breakPoint(Timeline.Direction.Forwards, Timeline.BreakPointType.Move, 2050));
// console.log(t.breakPoint(Timeline.Direction.Backwards, Timeline.BreakPointType.Move, 2050));


var durFn = new Timeline.AlgDuration(Timeline.DefaultDurationForAmount);
var posFn = new Timeline.AlgPosition(durFn);
var dirCur = new Timeline.DirectionWithCursor(Timeline.Direction.Backwards, 14000);
}


