import crypto from 'crypto';

/**
 * Parses the WWW-Authenticate Digest challenge header.
 * @param {string} headerValue - The value of the WWW-Authenticate header.
 * @returns {object | null} An object containing challenge parameters (realm, nonce, qop, etc.) or null if not a Digest challenge.
 */
function parseDigestChallenge(headerValue) {
    if (!headerValue || !headerValue.toLowerCase().startsWith('digest ')) {
        return null;
    }
    const params = {};
    const challenges = headerValue.substring(7).split(','); // Remove 'Digest ' and split
    challenges.forEach(part => {
        const eqIndex = part.indexOf('=');
        if (eqIndex !== -1) {
            const key = part.substring(0, eqIndex).trim();
            let value = part.substring(eqIndex + 1).trim();
            // Remove surrounding quotes if present
            if (value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1, -1);
            }
            params[key] = value;
        }
    });
    // Check for essential parameters
    if (!params.realm || !params.nonce) {
        console.warn("Digest challenge missing realm or nonce:", params);
        return null;
    }
    return params;
}

/**
 * Calculates the Digest response hash.
 * @param {object} params - Parsed challenge parameters.
 * @param {string} username - The username.
 * @param {string} password - The password.
 * @param {string} method - HTTP method (e.g., 'GET').
 * @param {string} path - The request path (e.g., '/ajax/library-info').
 * @param {number} nc - Nonce count (integer).
 * @param {string} cnonce - Client nonce string.
 * @returns {string | null} The calculated response hash or null on error.
 */
function calculateDigestResponse(params, username, password, method, path, nc, cnonce) {
    const realm = params.realm;
    const nonce = params.nonce;
    const qop = params.qop; // Quality of protection (e.g., 'auth')
    const algorithm = params.algorithm || 'MD5'; // Default to MD5

    if (algorithm.toUpperCase() !== 'MD5' && algorithm.toUpperCase() !== 'MD5-SESS') {
        console.error(`Unsupported Digest algorithm: ${algorithm}`);
        return null;
    }

    const md5 = (data) => crypto.createHash('md5').update(data).digest('hex');

    // Calculate HA1
    let ha1;
    const ha1Secret = `${username}:${realm}:${password}`;
    if (algorithm.toUpperCase() === 'MD5-SESS') {
        const ha1SessPart = md5(ha1Secret);
        ha1 = md5(`${ha1SessPart}:${nonce}:${cnonce}`);
    } else { // MD5
        ha1 = md5(ha1Secret);
    }

    // Calculate HA2
    let ha2;
    const digestURI = path; // Path and query string
    if (qop === 'auth-int') {
        // Requires MD5 of entity body - complex, usually not needed for GET
        console.error("Digest qop=auth-int is not supported in this implementation.");
        return null;
    } else { // Assumes 'auth' or no qop specified
        ha2 = md5(`${method}:${digestURI}`);
    }

    // Calculate response
    let response;
    const ncHex = nc.toString(16).padStart(8, '0'); // Format nonce count as 8-digit hex

    if (qop === 'auth' || qop === 'auth-int') {
        response = md5(`${ha1}:${nonce}:${ncHex}:${cnonce}:${qop}:${ha2}`);
    } else { // No qop specified (older RFC 2069 style)
        response = md5(`${ha1}:${nonce}:${ha2}`);
    }

    return response;
}

/**
 * Generates a random client nonce (cnonce).
 * @returns {string} A random hexadecimal string.
 */
function generateCnonce() {
    return crypto.randomBytes(8).toString('hex');
}

/**
 * Fetches a resource using manual Digest Authentication.
 * @param {string} url - The full URL to fetch.
 * @param {object} options - Fetch options (method, headers, etc.).
 * @param {{username: string, password: string}} credentials - User credentials.
 * @returns {Promise<Response>} The final fetch Response object.
 */
async function fetchWithManualDigest(url, options = {}, credentials) {
    if (!credentials || !credentials.username) {
        // No credentials provided, attempt a normal fetch
        console.log(`Making standard fetch request to ${url} (no credentials)`);
        return fetch(url, options);
    }

    const { username, password } = credentials;
    const method = options.method || 'GET';
    const urlObj = new URL(url);
    const path = urlObj.pathname + urlObj.search; // Include query string

    console.log(`Attempting Digest Auth fetch (1st req) to ${url}`);
    let response1;
    try {
        // First request - expect 401
        response1 = await fetch(url, options);
    } catch (err) {
        console.error(`Initial fetch request failed for ${url}: ${err.message}`);
        throw new Error(`Network error during initial Digest request: ${err.message}`);
    }


    if (response1.status !== 401) {
        // Not a 401, maybe auth isn't needed or something else is wrong. Return the response.
        console.log(`Initial fetch to ${url} returned status ${response1.status}. Returning response directly.`);
        return response1;
    }

    const wwwAuthHeader = response1.headers.get('WWW-Authenticate');
    const challenge = parseDigestChallenge(wwwAuthHeader);

    if (!challenge) {
        console.error(`Did not receive a valid Digest challenge from ${url}. Header: ${wwwAuthHeader}`);
        // Return the original 401 response
        // return response1;
        throw new Error(`Authentication required, but no valid Digest challenge received from server. Status: ${response1.status}`);
    }

    console.log(`Received Digest challenge from ${url}. Realm: ${challenge.realm}, Nonce: ${challenge.nonce}`);

    // Prepare for second request
    const nc = 1; // Nonce count starts at 1 for the first use of a nonce
    const cnonce = generateCnonce();
    const digestResponse = calculateDigestResponse(challenge, username, password, method, path, nc, cnonce);

    if (!digestResponse) {
        throw new Error("Failed to calculate Digest response.");
    }

    // Construct Authorization header
    const authParts = [
        `username="${username}"`,
        `realm="${challenge.realm}"`,
        `nonce="${challenge.nonce}"`,
        `uri="${path}"`,
        `response="${digestResponse}"`
    ];
    if (challenge.opaque) {
        authParts.push(`opaque="${challenge.opaque}"`);
    }
    if (challenge.algorithm) {
        authParts.push(`algorithm=${challenge.algorithm}`); // Algorithm usually not quoted
    }
    if (challenge.qop) { // If server specified qop, we MUST include qop, nc, cnonce
        authParts.push(`qop=${challenge.qop}`);
        authParts.push(`nc=${nc.toString(16).padStart(8, '0')}`);
        authParts.push(`cnonce="${cnonce}"`);
    }

    const authHeader = `Digest ${authParts.join(', ')}`;

    // Prepare options for the second request
    const options2 = { ...options };
    options2.headers = { ...(options.headers || {}), 'Authorization': authHeader };

    console.log(`Making Digest Auth fetch (2nd req) to ${url}`);
    // Second request with Authorization header
    return fetch(url, options2);
}

export { fetchWithManualDigest };