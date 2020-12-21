import { concat, EMPTY, merge, NEVER, Observable, of, Subject } from 'rxjs';
import {
  ChangeDetectorRef,
  EmbeddedViewRef,
  IterableChangeRecord,
  IterableChanges,
  TemplateRef,
  ViewContainerRef
} from '@angular/core';
import { map, mergeMap, publish, switchMap } from 'rxjs/operators';
import { RxForViewContext } from './rx-for-context';
import { ngInputFlatten } from '../../../../shared/utils/ngInputFlatten';
import { StrategyCredentials } from '../../../../shared/rx-angular-pocs/render-stragegies';
import { RxNotification } from '../../../../../../../../libs/template/src/lib/core';


interface RxIteratorContext<C> {

}

interface RxViewContainerRef<C> {
  embeddedViewChanged$: Observable<EmbeddedViewRef<C>>;

  connectChanges(changes$: Observable<C>): void;

  subscribe(): void;
}

const forEachInsertToArray = forEachToArray('forEachAddedItem');
const forEachMoveToArray = forEachToArray('forEachMovedItem');
const forEachRemoveToArray = forEachToArray('forEachRemovedItem');
const forEachUpdateToArray = forEachToArray('forEachIdentityChange');


// What is an still existing item?
// An item that is in the view containerRef which is not removed


function updateInsertedAndMovedViewContext(insertsAndMoveAndUnchanged, count) {
  const result = [];
  for (const insert of insertsAndMoveAndUnchanged) {
    const index = insert.context.index;
    const even = index % 2 === 0;
    const newCtx = {
      index,
      count,
      first: index === 0,
      last: index === count - 1,
      even,
      odd: !even
    };
    const old = insert.work;
    insert.work = () => {
      insert.context.setComputedContext(newCtx);
      // tslint:disable-next-line:no-unused-expression
      old && old();
    };
    result.push(insert);
  }
  return result;
}

function createViewContext<T>(record: IterableChangeRecord<T>, arr): RxForViewContext<T> {
  const ctx = new RxForViewContext<T>(record.item, arr);
  // create uses the current index
  ctx.setComputedContext({ index: record.currentIndex });
  return ctx;
}


export function createViewContainerRef<T>(config: {
  viewContainerRef: ViewContainerRef,
  templateRef: TemplateRef<RxForViewContext<T>>,
  createViewContext: (record: IterableChangeRecord<T>) => RxForViewContext<T>
  updateInsertedViewContext: (context: RxForViewContext<T>) => RxForViewContext<T>
}): RxViewContainerRef<T> {
  const {
    viewContainerRef,
    templateRef
    //  createViewContext,
    //  updateInsertedViewContext
  } = config;

  const strat = {} as StrategyCredentials;

  const containerToUpdate$ = new Subject<ViewContainerRef>();
  const embeddedViewToUpdate$ = new Subject<EmbeddedViewRef<T>>();

  const changesSubject = new Subject();
  const changes$ = changesSubject.pipe(
    ngInputFlatten()
  );
  const containerUpdate$ = EMPTY;

  // Create Context of EmbeddedView + vCR
  // const inserts$ = changes$.pipe(addedItemToObservable()) as Observable<IterableChangeRecord<T>>;
  // Nothing special as we just remove + vCR
  // const removes$ = changes$.pipe(removedItemToObservable()) as Observable<IterableChangeRecord<T>>;
  // Update Context of EmbeddedView + vCR
//  const moves$ = changes$.pipe(movedItemToObservable()) as Observable<IterableChangeRecord<T>>;

  // Update Context of EmbeddedView
  const strategy$: Observable<any>;
  const updates$ = changes$.pipe() as Observable<IterableChangeRecord<T>>;

  const domStructureChange2$ = changes$.pipe(
    map((change) => {
      let count = 0;
      const works = {
        insert: forEachInsertToArray(change)
          .map(record => {
            ++count;
            const context = createViewContext(record);
            return {
              record,
              context,
              work: () => insertEmbeddedView(context)
            };
          }),
        move: forEachMoveToArray(change)
          .map(record => {
            const ev = viewContainerRef.get(record.previousIndex);
            return {
              record,
              context: (ev as any).context,
              work: () => viewContainerRef.move(ev, record.currentIndex)
            };
          }),
        remove: forEachRemoveToArray(change)
          .map(record => {
            --count;
            return {
              record,
              work: () => viewContainerRef.remove(record.previousIndex)
            };
          })
      };
      return {
        count,
        works
      };
    })
  );


  const domStructureChange$ = changes$.pipe(
    (c$) => {
      let count = 0;
      return merge(
        // Create Context of EmbeddedView + vCR
        c$.pipe(
          addedItemToObservable(),
          map((record: IterableChangeRecord<T>) => {
            ++count;
            return () => insertEmbeddedView(createViewContext(record));
          })
        ),
        // Nothing special as we just remove + vCR
        c$.pipe(
          removedItemToObservable(),
          map((record: IterableChangeRecord<T>) => () => viewContainerRef.remove(record.previousIndex))
        ),
        // Update Context of EmbeddedView + vCR
        c$.pipe(
          movedItemToObservable(),
          map((record: IterableChangeRecord<T>) => () => {
            viewContainerRef.move(viewContainerRef.get(record.previousIndex), record.currentIndex);
          })
        )
      );
    }
  );

  const eVChange$ = changes$.pipe(
    (c$) => {
      return c$.pipe(
        identityChangeToObservable<T>(),
        switchMap((record: IterableChangeRecord<T>) => {
          const ev = viewContainerRef.get(record.currentIndex);
          // @TODO use publish
          return strat.work(ev);
        })
      );
    }
  );

  const update = domStructureChange2$.pipe(
    // EV needs context
    mergeMap(({ count, works }) => {
      count = count + viewContainerRef.length;
      const indexesToIgnore = [
        ...works.move.map(o => o.record.previousIndex),
        ...works.remove.map(o => o.record.previousIndex)
      ];
      const allIndex = new Array(ViewContainerRef.length - 1).fill((idx) => idx);
      const unchanged = allIndex.filter(i => indexesToIgnore.includes(i)).map(index => {
        const c = viewContainerRef.get(index);
        return ({
          record: { index },
          context: (c as any).context
        });
      });

      return updateInsertedAndMovedViewContext([...works.insert, ...works.move, ...unchanged], count);
    }),
    publish((works$) => works$.pipe(
      switchMap(
        applyStrategy(strategy$)
      )
    ))
  );

  return {
    connectChanges(newChanges$: Observable<T>): void {
      changesSubject.next(newChanges$);
    },
    embeddedViewChanged$: embeddedViewToUpdate$,
    subscribe
  };

  function subscribe(): void {

  }

  //

  function updateViewContext(context: RxForViewContext<T>, contextUpdate: Partial<T>) {
    Object.entries(contextUpdate).forEach(([key, value]) => {
      context[key] = value;
    });
  }

  function insertEmbeddedView(context: RxForViewContext<T>) {
    viewContainerRef.createEmbeddedView(
      templateRef,
      context
    );
  }

}

export function applyStrategy<T>(
  credentials$: Observable<StrategyCredentials>,
  getContext: (v?: any) => any,
  getCdRef: (k: RxNotification<T>) => ChangeDetectorRef
): (o$: Observable<{
  work: any,
  record: any,
  context: any,
}>) => Observable<RxNotification<T>> {
  return notification$ => notification$.pipe(
    publish((n$) =>
      credentials$.pipe(
        switchMap((credentials) => n$.pipe(
          switchMap(_work => {
            const activeEmbeddedView = _work.record;
            const work = () => credentials.work(activeEmbeddedView, context, work);
            return concat(of(work), NEVER).pipe(
              credentials.behavior(work, context)
            );
          })
          )
        )
      )
    )
  );
}

function operationsToObservable<T>() {
  return (changes) => new Observable((subscriber) => {
    changes.forEachOperation(
      (
        record: IterableChangeRecord<T>,
        previousIndex: number | null,
        currentIndex: number | null
      ) => {
        subscriber.next({ record, previousIndex, currentIndex });
      });
  });
}


function addedItemToObservable<T>() {
  return o$ => o$.pipe(
    switchMap((changes: IterableChanges<any>) => new Observable((subscriber) => {
        changes.forEachAddedItem((record) => {
          subscriber.next(record);
        });
        subscriber.complete();
      })
    )
  ) as unknown as Observable<IterableChangeRecord<T>>;
}


function identityChangeToObservable<T>() {
  return o$ => o$.pipe(
    switchMap((changes: IterableChanges<any>) => new Observable((subscriber) => {
        changes.forEachIdentityChange((record) => {
          subscriber.next(record);
        });
        subscriber.complete();
      })
    )
  ) as unknown as Observable<IterableChangeRecord<T>>;
}

function movedItemToObservable<T>() {
  return o$ => o$.pipe(
    switchMap((changes: IterableChanges<any>) => new Observable((subscriber) => {
        changes.forEachMovedItem((record) => {
          subscriber.next(record);
        });
        subscriber.complete();
      })
    )
  ) as unknown as Observable<IterableChangeRecord<T>>;
}

function removedItemToObservable<T>() {
  return o$ => o$.pipe(
    switchMap((changes: IterableChanges<any>) => new Observable((subscriber) => {
        changes.forEachRemovedItem((record) => {
          subscriber.next(record);
        });
        subscriber.complete();
      })
    )
  ) as unknown as Observable<IterableChangeRecord<T>>;
}


function forEachToObservable<T>(method: string) {
  return o$ => o$.pipe(
    switchMap((changes: IterableChanges<any>) => new Observable((subscriber) => {
        changes[method]((record) => {
          subscriber.next(record);
        });
        subscriber.complete();
      })
    )
  ) as unknown as Observable<IterableChangeRecord<T>>;
}

function forEachToArray<T>(method: string) {
  return (changes) => {
    const arr = [];
    changes[method]((record) => arr.push(record));
    return arr;
  };
}

