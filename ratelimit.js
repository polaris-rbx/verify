const { RatelimitError } = require("./HttpError");

/**
 * Create a rate limit bucket
 * @param limitNo - The number of requests allowed per limitPeriod
 * @param limitPeriod - The limit length in seconds
 * @returns {{run: run, trigger: trigger}}
 */
function makeRatelimit(limitNo, limitPeriod) {
    let since = 0;
    let requestsMade = 0;

    /**
     * Perform one of 'action', and increment the counter.
     * Throws an error is rate limit is exceeded.
     * @returns {void}
     */
    function run() {
        // If it has been less than ratelimit period since rate limit set, it's valid.
        if (Date.now() - since < (limitPeriod * 1000)) {
            if (requestsMade >= limitNo) {
                // Rate limit hit.
                const retryAfter = ((since + (limitPeriod * 1000)) - Date.now())/1000 + 5;
                throw new RatelimitError({status: 429, message: "Too many requests", retryAfter, isLocal: true })
            }
            console.log(`${requestsMade}:${limitNo}`)
        } else {
            // it's expired
            requestsMade = 0;
            since = Date.now();
        }
        requestsMade++;
    }

    /**
     * Trigger the rate limit as if it had been locally activated - so subsequent requests error until ready to resume.
     * @param retryAfter - The time to wait (in seconds) until resumption is allowed
     */
    function trigger (retryAfter) {
        requestsMade = limitNo
        since = (Date.now() + retryAfter * 1000)
    }


    return {
        run, trigger
    }
}
module.exports = makeRatelimit;
