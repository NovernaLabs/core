// Base Class for every exception
export class FrameworkException extends Error {
  public readonly code: string;

  public constructor(message: string, code = 'FRAMEWORK_ERROR', options?: { cause?: unknown }) {
    super(message, options as ErrorOptions);
    this.code = code;
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class DependencyResolutionException extends FrameworkException {
  public constructor(
    message: string,
    public readonly path: readonly string[] = [],
  ) {
    super(
      path.length > 0 ? `${message}\n  resolution path: ${path.join(' → ')}` : message,
      'DI_RESOLUTION_FAILED',
    );
  }
}

export class CircularDependencyException extends FrameworkException {
  public constructor(public readonly path: readonly string[]) {
    super(`Circular dependency detected: ${path.join(' → ')}`, 'DI_CIRCULAR_DEPENDENCY');
  }
}

export class ModuleException extends FrameworkException {
  public constructor(message: string) {
    super(message, 'MODULE_ERROR');
  }
}

export class LifecycleException extends FrameworkException {
  public constructor(message: string) {
    super(message, 'LIFECYCLE_ERROR');
  }
}

export class ForbiddenException extends FrameworkException {
  public constructor(
    message = 'Forbidden',
    public readonly guard?: string,
  ) {
    super(message, 'FORBIDDEN');
  }
}

export class ValidationException extends FrameworkException {
  public constructor(
    message: string,
    public readonly details?: unknown,
  ) {
    super(message, 'VALIDATION_FAILED');
  }
}

export class NotFoundException extends FrameworkException {
  public constructor(message = 'Not found') {
    super(message, 'NOT_FOUND');
  }
}

export class HttpException extends FrameworkException {
  public constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message, 'HTTP_ERROR');
  }
}

export class PersistenceException extends FrameworkException {
  public constructor(message: string, options?: { cause?: unknown }) {
    super(message, 'PERSISTENCE_ERROR', options);
  }
}

export class PlayerNotFoundException extends FrameworkException {
  public constructor(source: number | string) {
    super(`No player is registered for source ${String(source)}`, 'PLAYER_NOT_FOUND');
  }
}
