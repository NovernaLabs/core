// Application & lifecycle
export {
  APPLICATION,
  Application,
  type ApplicationOptions,
} from './application';
// Handler decorators
export {
  Cron,
  Delete,
  Export,
  Get,
  Interval,
  type NetEventOptions,
  OnEvent,
  OnGlobalStateBagChange,
  OnNetEvent,
  OnNuiEvent,
  OnResourceStart,
  OnResourceStop,
  OnStateBagChange,
  Patch,
  Post,
  Put,
  Tick,
} from './decorators/handlers';

// Dependency injection
export {
  getInjectableOptions,
  Inject,
  Injectable,
  type InjectableOptions,
  isInjectable,
  Optional,
} from './decorators/injectable';
export { Container, describeDependencies } from './di/container';
export { normalizeProvider, providerToken } from './di/provider';
export {
  type ClassProvider,
  type ExistingProvider,
  type FactoryProvider,
  type Provider,
  type ProviderDefinition,
  Scope,
  type ValueProvider,
} from './di/types';
// Errors
export {
  BaseExceptionFilter,
  ExceptionHandler,
  type ExceptionOutcome,
} from './errors/exception.handler';
export {
  CircularDependencyException,
  DependencyResolutionException,
  ForbiddenException,
  FrameworkException,
  HttpException,
  LifecycleException,
  ModuleException,
  NotFoundException,
  PersistenceException,
  PlayerNotFoundException,
  ValidationException,
} from './errors/exceptions';
// Events
export {
  EventBus,
  type EventListener,
  type FrameworkEvents,
} from './events/event.bus';
export {
  parseBagName,
  type StateBagChange,
  type StateBagOwner,
  toStateBagChange,
} from './events/statebag';
// Execution pipeline
export type {
  ArgumentMetadata,
  CanActivate,
  ExceptionFilter,
  Interceptor,
  Middleware,
  PipelineRef,
  PipeTransform,
} from './execution/contracts';
export { ExecutionContext, ExecutionType } from './execution/execution.context';
export {
  Controller,
  collectHandlers,
  getControllerPrefix,
  type HandlerDeclaration,
  HandlerKind,
  type HandlerOptions,
  UseGuards,
  UseInterceptors,
  UseMiddleware,
  UsePipes,
} from './execution/handler.metadata';
export {
  Arg,
  Args,
  Bag,
  Body,
  Ctx,
  Dep,
  Headers,
  Param,
  ParamKind,
  Player,
  Query,
  Req,
  Res,
  Source,
} from './execution/params';
export {
  createHandlerBinding,
  type DispatchResult,
  ExecutionPipeline,
  type HandlerBinding,
  type Invocation,
  type InvocationExtras,
  type PipelineDependencies,
} from './execution/pipeline';
// HTTP
export {
  type HttpContext,
  type HttpRequest,
  HttpResponse,
  parseBody,
} from './http/http.context';
export {
  HttpMethod,
  HttpRouter,
  joinPath,
  normalizePath,
  parseQuery,
  type Route,
  type RouteMatch,
} from './http/router';
export {
  hasHook,
  LifecyclePhase,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
  type OnDispose,
  type OnModuleDestroy,
  type OnModuleInit,
} from './lifecycle/hook';
// Logging
export {
  LOG_LEVEL_NAMES,
  Logger,
  type LoggerOptions,
  type LoggerTransport,
  LogLevel,
  type LogRecord,
  MemoryTransport,
  serializeError,
} from './logging/logger';
// Metrics
export {
  InMemoryMetricsProvider,
  type MetricLabels,
  MetricsInterceptor,
  MetricsProvider,
  NoopMetricsProvider,
} from './metrics/metrics';
// Modules
export {
  getModuleMetadata,
  isModule,
  Module,
  type ModuleMetadata,
} from './modules/module.metadata';
export { ModuleRef, ModuleRegistry } from './modules/module.registry';
// Persistence - is in the works
// export {
//   persistenceConformance,
//   runConformance,
//   type AdapterTestCase,
//   type ConformanceContext,
//   type ConformanceRecord,
//   type ConformanceResult,
// } from "./persistence/conformance";
// export { withMainThreadResume } from "./persistence/main-thread";
// export {
//   MemoryAdapter,
//   type MemoryAdapterOptions,
// } from "./persistence/memory-adapter";
// export {
//   PersistenceAdapter,
//   type FindQuery,
//   type OrderBy,
//   type PersistenceCapabilities,
//   type Repository,
//   type RepositoryOptions,
//   type SortDirection,
//   type TransactionContext,
//   type Where,
// } from "./persistence/port";
// export { repositoryProvider } from "./persistence/repository-provider";
// Player
export {
  isPlayerClass,
  playerTokenChain,
  SharedPlayer,
  type StateBagView,
} from './player/shared.player';
// Scheduling
export { CronExpression, CronSyntaxError, parseCron } from './scheduler/cron';
export {
  defaultSchedulerRuntime,
  Scheduler,
  type SchedulerRuntime,
} from './scheduler/scheduler';

// Tokens
export {
  CURRENT_PLAYER,
  CURRENT_SOURCE,
  MAIN_THREAD,
  type MainThreadScheduler,
  PLAYER_RESOLVER,
  type PlayerResolver,
  RESOURCE_NAME,
  RUNTIME_SIDE,
} from './token';
