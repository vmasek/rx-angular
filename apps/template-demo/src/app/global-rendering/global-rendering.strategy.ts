import { coalesceWith, RenderStrategy, RenderStrategyFactoryConfig } from '@rx-angular/template';
import { from } from 'rxjs';
import { GlobalTaskPriority } from './global-task-manager';
import { scheduleOnGlobalTick } from './globalAnimationFrameTick';
import { coalesceAndScheduleGlobal } from './static-schedule-and-coalesce-global';


const promiseDurationSelector = from(Promise.resolve());

/**
 * Experimental Local Strategies
 *
 * - ɵDC - `ɵdetectChanges`
 * - C - `Component`
 * - det - `cdRef.detach`
 * - ret - `cdRef.reattach`
 * - Pr - `Promise`
 * - aF - `requestAnimationFrame`
 *
 * | Name        | ZoneLess | Render Method | ScopedCoalescing | Scheduling | Chunked |
 * |-------------| ---------| --------------| ---------------- | ---------- |-------- |
 * | `local`     | ✔        | ɵDC           | C + Pr           | aF         | ❌      |
 * | `detach`    | ✔ ️     | ret,ɵDC, det  | C + Pr           | aF         | ❌      |
 *
 */

export function getGlobalRenderingStrategies<T>(
  config: RenderStrategyFactoryConfig
): { [strategy: string]: RenderStrategy } {
  return {
    chunk: createChunkStrategy(config),
    blocking: createBlockingStrategy(config),
    detachChunk: createDetachChunkStrategy(config),
    detachBlocking: createDetachBlockingStrategy(config)
  };
}

export function createBlockingStrategy<T>(
  config: RenderStrategyFactoryConfig
): RenderStrategy {
  const scope = (config.cdRef as any).context;
  const taskPriority = GlobalTaskPriority.blocking;

  const renderMethod = () => {
    config.cdRef.detectChanges();
  };
  const behavior = o =>
    o.pipe(
      coalesceWith(promiseDurationSelector, scope),
      scheduleOnGlobalTick(() => ({
        priority: taskPriority,
        work: renderMethod,
        scope
      }))
    );

  const scheduleCD = <R>(afterCD?: () => R) =>
    coalesceAndScheduleGlobal(() => {
      renderMethod();
      if (afterCD) {
        afterCD();
      }
    }, taskPriority, scope);

  return {
    name: 'blocking',
    detectChanges: renderMethod,
    rxScheduleCD: behavior,
    scheduleCD
  };
}

export function createChunkStrategy<T>(
  config: RenderStrategyFactoryConfig
): RenderStrategy {
  const scope = (config.cdRef as any).context;
  const taskPriority = GlobalTaskPriority.chunk;

  const renderMethod = () => {
    config.cdRef.detectChanges();
  };
  const behavior = o =>
    o.pipe(
      scheduleOnGlobalTick(() => ({
        priority: taskPriority,
        work: renderMethod,
        scope
      }))
    );

  const scheduleCD = <R>(afterCD?: () => R) =>
    coalesceAndScheduleGlobal(() => {
      renderMethod();
      if (afterCD) {
        afterCD();
      }
    }, taskPriority, scope);

  return {
    name: 'chunk',
    detectChanges: renderMethod,
    rxScheduleCD: behavior,
    scheduleCD
  };
}

export function createDetachChunkStrategy<T>(
  config: RenderStrategyFactoryConfig
): RenderStrategy {
  const scope = (config.cdRef as any).context;
  const taskPriority = GlobalTaskPriority.chunk;
  const renderMethod = () => {
    config.cdRef.reattach();
    config.cdRef.detectChanges();
    config.cdRef.detach();
  };
  const behavior = o =>
    o.pipe(
      scheduleOnGlobalTick(() => ({
        priority: taskPriority,
        work: renderMethod,
        scope
      }))
    );

  const scheduleCD = <R>(afterCD?: () => R) =>
    coalesceAndScheduleGlobal(() => {
      renderMethod();
      if (afterCD) {
        afterCD();
      }
    }, taskPriority, scope);

  return {
    name: 'detachChunk',
    detectChanges: renderMethod,
    rxScheduleCD: behavior,
    scheduleCD
  };
}

export function createDetachBlockingStrategy<T>(
  config: RenderStrategyFactoryConfig
): RenderStrategy {
  const scope = (config.cdRef as any).context;
  const taskPriority = GlobalTaskPriority.blocking;
  const renderMethod = () => {
    config.cdRef.reattach();
    config.cdRef.detectChanges();
    config.cdRef.detach();
  };
  const behavior = o =>
    o.pipe(
      scheduleOnGlobalTick(() => ({
        priority: taskPriority,
        work: renderMethod,
        scope
      }))
    );

  const scheduleCD = <R>(afterCD?: () => R) =>
    coalesceAndScheduleGlobal(() => {
      renderMethod();
      if (afterCD) {
        afterCD();
      }
    }, taskPriority, scope);

  return {
    name: 'detachBlocking',
    detectChanges: renderMethod,
    rxScheduleCD: behavior,
    scheduleCD
  };
}
