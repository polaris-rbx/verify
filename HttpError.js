class HttpError extends Error {
    constructor(error) {
        super(error.message || `${error.status}: Verification API Error`);
        this.status = error.status;
    }
}
class RatelimitError extends HttpError {
    constructor(error) {
        super(error);
        this.retryAfter = error.retryAfter;
        this.isLocal = error.isLocal || false;
    }
}

module.exports = { HttpError, RatelimitError }
