import type { Dict } from '../../shared';
import { Injectable } from '../decorators/injectable';
import type { Interceptor } from '../execution/contracts';
import type { ExecutionContext } from '../execution/execution.context';

export type MetricLabels = Record<string, string | number | boolean>;

export abstract class MetricsProvider {
  public abstract counter(name: string, value?: number, labels?: MetricLabels): void;
  public abstract histogram(name: string, value: number, labels?: MetricLabels): void;
  public abstract gauge(name: string, value: number, labels?: MetricLabels): void;
}

export class NoopMetricsProvider extends MetricsProvider {
  public counter(): void {}
  public histogram(): void {}
  public gauge(): void {}
}

interface HistogramState {
  count: number;
  sum: number;
  min: number;
  max: number;
}

export class InMemoryMetricsProvider extends MetricsProvider {
  readonly #counters = new Map<string, number>();
  readonly #gauges = new Map<string, number>();
  readonly #histograms = new Map<string, HistogramState>();

  public counter(name: string, value = 1, labels?: MetricLabels): void {
    const key = seriesKey(name, labels);
    this.#counters.set(key, (this.#counters.get(key) ?? 0) + value);
  }

  public gauge(name: string, value: number, labels?: MetricLabels): void {
    this.#gauges.set(seriesKey(name, labels), value);
  }

  public histogram(name: string, value: number, labels?: MetricLabels): void {
    const key = seriesKey(name, labels);
    const state = this.#histograms.get(key);
    if (!state) {
      this.#histograms.set(key, {
        count: 1,
        sum: value,
        min: value,
        max: value,
      });
      return;
    }
    state.count += 1;
    state.sum += value;
    if (value < state.min) state.min = value;
    if (value > state.max) state.max = value;
  }

  public snapshot(): {
    counters: Dict<number>;
    gauges: Dict<number>;
    histograms: Dict<HistogramState & { avg: number }>;
  } {
    return {
      counters: Object.fromEntries(this.#counters),
      gauges: Object.fromEntries(this.#gauges),
      histograms: Object.fromEntries(
        [...this.#histograms].map(([key, state]) => [
          key,
          { ...state, avg: state.count === 0 ? 0 : state.sum / state.count },
        ]),
      ),
    };
  }

  public reset(): void {
    this.#counters.clear();
    this.#gauges.clear();
    this.#histograms.clear();
  }
}

function seriesKey(name: string, labels?: MetricLabels): string {
  if (!labels) return name;
  const pairs = Object.entries(labels)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, value]) => `${key}=${String(value)}`);
  return pairs.length === 0 ? name : `${name}{${pairs.join(',')}}`;
}

@Injectable()
export class MetricsInterceptor implements Interceptor {
  public constructor(private readonly metrics: MetricsProvider) {}

  public async intercept(
    context: ExecutionContext,
    next: () => Promise<unknown>,
  ): Promise<unknown> {
    const started = Date.now();
    const labels: MetricLabels = {
      handler: `${context.target.name}.${context.handlerName}`,
    };
    try {
      const result = await next();
      this.metrics.counter('interceptor.success', 1, labels);
      return result;
    } catch (error) {
      this.metrics.counter('interceptor.errors', 1, labels);
      throw error;
    } finally {
      this.metrics.histogram('interceptor.duration', Date.now() - started, labels);
    }
  }
}
