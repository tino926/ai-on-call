/**
 * 基礎錯誤類別
 */
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 配置錯誤
 */
export class ConfigError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'CONFIG_ERROR', 400, details);
  }
}

/**
 * 驗證錯誤
 */
export class ValidationError extends AppError {
  constructor(
    message: string,
    public field: string,
    public value: unknown,
    public constraint?: string
  ) {
    super(message, 'VALIDATION_ERROR', 400, { field, value, constraint });
  }
}

/**
 * Runtime 錯誤
 */
export class RuntimeError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'RUNTIME_ERROR', 500, details);
  }
}

/**
 * 認證錯誤
 */
export class AuthError extends AppError {
  constructor(message: string = 'Unauthorized access') {
    super(message, 'AUTH_ERROR', 401);
  }
}

/**
 * 服務錯誤
 */
export class ServiceError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'SERVICE_ERROR', 503, details);
  }
}
