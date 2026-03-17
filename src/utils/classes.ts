export class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message)
    this.name = 'HttpError'
    Error.captureStackTrace(this, this.constructor)
  }
}

export class DelhiveryManifestError extends HttpError {
  public readonly isManifestError = true
  constructor(statusCode: number, message: string, public details?: any) {
    super(statusCode, message)
    this.name = 'DelhiveryManifestError'
  }
}
