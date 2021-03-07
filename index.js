const fetch = require("node-fetch");
const { RatelimitError, HttpError } = require("./HttpError");
const makeRateLimit = require("./ratelimit");

const BASE_URL = "https://verify.nezto.re"

let useLog = false;
let token;
let cacheTime = 60;

const globalRatelimit = makeRateLimit(60, 60);
const reverseRatelimit = makeRateLimit(30, 60);

const cache = new Map();

/**
 * Set the program options
 * @param opt The options object
 * @param opt.useLog Boolean indicating whether or not debug logs should be outputted. You probably don't want these.
 * @param opt.token String containing an optional authorization token. Only needed if you using internal endpoints, only internal applications get these.
 * @param opt.cacheTime Number The time (in seconds) to cache values for. Defaults to 60 seconds.
 */
function setOptions (opt) {
    if (opt.useLog) {
        useLog = opt.useLog || false;
    }
    if (opt.token) {
        token = opt.token;
    }
    if (opt.cacheTime) {
        cacheTime = opt.cacheTime;
    }
}

/**
 * Output a log to the console, if enabled
 * @param args Values to print
 */
function log (...args) {
    if (useLog) {
        console.log(`Verify | ${args.join(" ")}`);
    }
}

/**
 * Retrieve an item from the cache
 * @param id - The id to use as cache key.
 * @returns {*} The item from cache, or undefined if not present.
 */
function getCache (id) {
    if (cache.has(id)) {
        const cacheItem = cache.get(id);
        if (cacheItem.expires > Date.now()) {
            return cacheItem.item;
        }
    }
}

/**
 * Set an item in the cache
 * @param id - Key to store it by
 * @param item - The item to store
 */
function setCache (id, item) {
    cache.set(id, {
        item,
        expires: Date.now() + ( cacheTime * 1000 )
    })
}

/**
 * Make a HTTP GET request, with authorization token if set and apply the global rate limit to it.
 * Throws an error for unexpected errors like 400 or too many requests. 404 (User not found) returns undefined.
 * @param uri - The relative path to the base URL, i.e. /api/roblox resolves to BASE.com/api/roblox.
 * @returns {Promise<*|undefined>}
 */
async function makeRequest (uri) {
    log("Request start");
    globalRatelimit.run();
    const opt = {
        headers: {
            authorization: token
        }
    }

    const res = await fetch(BASE_URL + uri, opt);
    const json = await res.json();
    if (res.ok) {
        return json;
    }

    if (res.status === 429) {
        // Rate limit hit!
        log("External limit hit");
        globalRatelimit.trigger(json.error.retryAfter || 3000);
        throw new RatelimitError(json.error);
    } else if (res.status === 404) {
        return undefined;
    }
    if (json.error) {
        throw new HttpError(json.error);
    }
    throw new Error(res);
}

/**
 * Retrieve the Roblox id for the discordId. Uses cache.
 * Throws a HttpError if an unexpected error is encountered like invalid id or too many requests.
 * Returns undefined if none found.
 * @param discordId (Snowflake/String) the discord id to check
 * @returns {Promise<Number|void>}
 */
async function getRoblox (discordId) {
    const cacheKey = `d-${discordId}`;
    const cachedItem = getCache(cacheKey);
    if (cachedItem) return cachedItem;

    const full = await makeRequest(`/api/roblox/${discordId}`);
    // Not found
    if (!full) return;
    log(`Got ${JSON.stringify(full)} for ${discordId}`);
    const ret = full && full.robloxId;
    setCache(cacheKey, ret);
    return ret
}

/**
 * Retrieve the Discord id for the discordId. Uses cache.
 * Throws a HttpError if an unexpected error is encountered like invalid id or too many requests.
 * Returns undefined if none found. Subject to the lower 30/min rate limit - If a user has opted out, undefined will be
 * returned.
 * @param robloxId - Roblox id of the user to reverse search
 * @returns {Promise<undefined|number>}
 */
async function getDiscord (robloxId) {
    const cacheKey = `r-${robloxId}`;
    const cachedItem = getCache(cacheKey);
    if (cachedItem) return cachedItem;
    // Reverse rate limit
    log("Reverse start");
    reverseRatelimit.run();

    const full = await makeRequest(`/api/reverse/${robloxId}`);
    // Not found
    if (!full) return;
    const ret = full && full.discordId;
    setCache(cacheKey, ret);
    return ret;
}

module.exports = {
    setOptions,
    getRoblox,
    getDiscord,
    makeRateLimit
}
