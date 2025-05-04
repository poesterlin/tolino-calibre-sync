import os from "os";
import fs from "fs";
import path from "path";
import { URL, URLSearchParams } from "url";
import axios from "axios";
import FormData from "form-data";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";

const jar = new CookieJar();

class TolinoError extends Error {
  constructor(message, cause = null) {
    super(message);
    this.name = "TolinoError";
    this.cause = cause;
  }
}

class TolinoCloud {
  // --- Static Properties (Partner Info, Hardware ID) ---

  static partnerName = {
    1: "Telekom",
    3: "Thalia.de",
    4: "Thalia.at",
    5: "Thalia.ch",
    6: "Buch.de",
    7: "buch.ch",
    8: "Books.ch / orellfuessli.ch",
    10: "Weltbild.de",
    11: "Weltbild.at",
    12: "Weltbild.ch",
    13: "Hugendubel.de",
    20: "derclub.de",
    21: "otto-media.de",
    22: "donauland.at",
    23: "osiander.de",
    30: "bücher.de",
    40: "Bild.de", // defunct?
    60: "StandaardBoekhandel.be",
    80: "Libri.de",
    81: "eBook.de",
    90: "ibs.it",
  };

  static partnerSettings = {
    // ... (Copy the entire partner_settings dictionary from Python here) ...
    // Example for Thalia.de:
    3: {
      client_id: "webreader",
      scope: "SCOPE_BOSH",
      signup_url: "https://www.thalia.de/shop/home/kunde/neu/",
      profile_url: "https://www.thalia.de/shop/home/kunde/",
      token_url: "https://www.thalia.de/auth/oauth2/token",
      login_form_url:
        "https://www.thalia.de/de.thalia.ecp.authservice.application/oauth2/login",
      "x_buchde.skin_id": "17",
      "x_buchde.mandant_id": "2",
      auth_url:
        "https://www.thalia.de/de.thalia.ecp.authservice.application/oauth2/authorize",
      login_url:
        "https://www.thalia.de/de.thalia.ecp.authservice.application/login.do",
      // 'revoke_url'       : 'https://www.thalia.de/de.buch.appservices/api/2004/oauth2/revoke',
      login_form: {
        username: "j_username",
        password: "j_password",
        extra: {
          login: "",
        },
      },
      login_cookie: "OAUTH-JSESSIONID",
      logout_url: "https://www.thalia.de/shop/home/login/logout/",
      reader_url:
        "https://webreader.mytolino.com/library/index.html#/mybooks/titles",
      register_url: "https://bosh.pageplace.de/bosh/rest/v2/registerhw",
      devices_url: "https://bosh.pageplace.de/bosh/rest/handshake/devices/list",
      unregister_url:
        "https://bosh.pageplace.de/bosh/rest/handshake/devices/delete",
      upload_url: "https://bosh.pageplace.de/bosh/rest/upload",
      meta_url: "https://bosh.pageplace.de/bosh/rest/meta",
      cover_url: "https://bosh.pageplace.de/bosh/rest/cover",
      sync_data_url:
        "https://bosh.pageplace.de/bosh/rest/sync-data?paths=publications,audiobooks",
      delete_url: "https://bosh.pageplace.de/bosh/rest/deletecontent",
      inventory_url: "https://bosh.pageplace.de/bosh/rest/inventory/delta",
      downloadinfo_url:
        "https://bosh.pageplace.de/bosh/rest//cloud/downloadinfo/{}/{}/type/external-download",
    },
    // Add ALL other partner settings from the Python code here
    // ...
    13: {
      // Hugendubel.de
      client_id: "4c20de744aa8b83b79b692524c7ec6ae",
      scope: "ebook_library",
      signup_url: "https://www.hugendubel.de/go/my_my/my_newRegistration/",
      profile_url: "https://www.hugendubel.de/go/my_my/my_data/",
      token_url: "https://api.hugendubel.de/rest/oauth2/token",
      // 'revoke_url'       : 'https://api.hugendubel.de/rest/oauth2/revoke',
      auth_url: "https://www.hugendubel.de/oauth/authorize",
      login_url: "https://www.hugendubel.de/de/account/login",
      login_form: {
        username: "username",
        password: "password",
        extra: {
          evaluate: "true",
          isOrdering: "",
          isOneClickOrdering: "",
        },
      },
      login_cookie: "JSESSIONID",
      logout_url: "https://www.hugendubel.de/de/account/logout",
      reader_url: "https://webreader.hugendubel.de/library/index.html",
      register_url: "https://bosh.pageplace.de/bosh/rest/registerhw",
      devices_url: "https://bosh.pageplace.de/bosh/rest/handshake/devices/list",
      unregister_url:
        "https://bosh.pageplace.de/bosh/rest/handshake/devices/delete",
      upload_url: "https://bosh.pageplace.de/bosh/rest/upload",
      meta_url: "https://bosh.pageplace.de/bosh/rest/meta",
      cover_url: "https://bosh.pageplace.de/bosh/rest/cover",
      sync_data_url:
        "https://bosh.pageplace.de/bosh/rest/sync-data?paths=publications,audiobooks",
      delete_url: "https://bosh.pageplace.de/bosh/rest/deletecontent",
      inventory_url: "https://bosh.pageplace.de/bosh/rest/inventory/delta",
      downloadinfo_url:
        "https://bosh.pageplace.de/bosh/rest//cloud/downloadinfo/{}/{}/type/external-download",
    },
    // ... Add ALL others
  };

  static _generateHardwareId() {
    const platform = os.platform();
    let osId = "x";
    if (platform === "win32") osId = "1";
    else if (platform === "darwin") osId = "2";
    else if (platform === "linux") osId = "3";

    // Hey, tolino developers: Let me know which id values to use here
    const engineId = "x"; // Placeholder
    const browserId = "xx"; // Placeholder
    const versionId = "00"; // Placeholder

    // Hey, tolino developers: Let me know what you need here.
    // This fingerprint is likely less meaningful without the canvas rendering,
    // but we replicate the structure.
    const fingerprint = "ABCDEFGHIJKLMNOPQR"; // Placeholder

    return `${osId}${engineId}${browserId}${
      fingerprint[0]
    }-${versionId}${fingerprint.substring(1, 4)}-${fingerprint.substring(
      4,
      9
    )}-${fingerprint.substring(9, 14)}-${fingerprint.substring(14, 18)}h`;
  }

  static hardwareId = TolinoCloud._generateHardwareId();

  // --- Instance Properties ---
  partnerId;
  partnerConfig;
  axiosInstance;
  cookieJar;
  useDevice;
  accessToken = null;
  refreshToken = null;
  tokenExpires = 0; // Store expiration time (e.g., Date.now() + expiresIn * 1000)

  // --- Constructor ---
  constructor(partnerId, useDevice = false) {
    if (!TolinoCloud.partnerSettings[partnerId]) {
      throw new TolinoError(`Unsupported partner ID: ${partnerId}`);
    }
    this.partnerId = partnerId;
    this.partnerConfig = TolinoCloud.partnerSettings[partnerId];
    this.useDevice = useDevice;

    // Setup axios instance with cookie support
    this.cookieJar = new CookieJar();
    this.axiosInstance = wrapper(
      axios.create({
        jar: this.cookieJar,
        withCredentials: true, // Important for sending cookies
        // Prevent Axios from throwing on 3xx redirects so we can handle them
        validateStatus: (status) => status >= 200 && status < 400,
        maxRedirects: 0, // We need to manually handle redirects for OAuth
      })
    );

    // Optional: Add interceptors for logging or common headers
    this.axiosInstance.interceptors.request.use((config) => {
      // console.debug('Request:', config.method.toUpperCase(), config.url, config.headers);
      // Add common headers if needed, e.g., User-Agent
      config.headers["User-Agent"] = "TolinoNodeClient/1.0";
      return config;
    });
    this.axiosInstance.interceptors.response.use(
      (response) => {
        // this._debug(response); // Log successful responses
        return response;
      },
      (error) => {
        // this._debug(error.response); // Log error responses
        return Promise.reject(error);
      }
    );
  }

  // --- Private Helper ---
  _debug(response) {
    if (!response) {
      console.debug(
        "-------------------- HTTP Error (No Response) --------------------"
      );
      return;
    }
    console.debug("-------------------- HTTP response --------------------");
    console.debug("status code:", response.status);
    // console.debug('cookies:', this.cookieJar.getCookiesSync(response.config.url)); // Requires sync cookie access
    console.debug("headers:", response.headers);
    console.debug("data:", response.data);
    console.debug("-------------------------------------------------------");
  }

  // --- Authentication ---

  /**
   * Logs in using either device credentials (refresh token) or username/password.
   * @param {string} identifier - Username or Hardware ID (if useDevice is true).
   * @param {string} secret - Password or Refresh Token (if useDevice is true).
   */
  async login(identifier, secret) {
    const c = this.partnerConfig;

    if (this.useDevice) {
      // Device Login (using refresh token)
      TolinoCloud.hardwareId = identifier; // Use provided ID as hardware ID
      const refreshToken = secret;

      // Libri.de (partner 80) seems to use the token directly? Check Python logic.
      // Assuming partner 80 might be different, handle if necessary.
      if (this.partnerId === 80) {
        console.warn(
          "Partner 80 (Libri.de) might have a different device auth flow. Assuming secret is access token."
        );
        this.accessToken = secret;
        // Note: No refresh token or expiry handling here for this specific case based on Python comments.
        return;
      }

      try {
        const response = await this.axiosInstance.post(
          c.token_url,
          new URLSearchParams({
            // Use URLSearchParams for application/x-www-form-urlencoded
            client_id: c.client_id,
            grant_type: "refresh_token",
            refresh_token: refreshToken,
            scope: c.scope,
          }).toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            // Reset validateStatus for this specific call if needed,
            // as we expect a 200 OK here.
            validateStatus: (status) => status === 200,
          }
        );

        const data = response.data;
        if (!data.access_token) {
          throw new Error("No access_token in response");
        }
        this.accessToken = data.access_token;
        this.refreshToken = data.refresh_token || refreshToken; // Keep old one if not provided
        this.tokenExpires = data.expires_in
          ? Date.now() + data.expires_in * 1000
          : 0;

        // TODO: Implement logic to persist the new this.refreshToken if needed
        console.log(
          "Device login successful. New refresh token:",
          this.refreshToken
        );
      } catch (error) {
        this._debug(error.response);
        throw new TolinoError(
          "OAuth refresh token request failed.",
          error.response?.data || error.message
        );
      }
    } else {
      // Username/Password Login (OAuth2 Authorization Code Flow)
      const username = identifier;
      const password = secret;

      // 1. Optional: Initial GET to login form URL (might set necessary cookies)
      if (c.login_form_url) {
        try {
          const params = {
            client_id: c.client_id,
            response_type: "code",
            scope: c.scope,
            redirect_uri: c.reader_url,
          };
          if (c["x_buchde.skin_id"])
            params["x_buchde.skin_id"] = c["x_buchde.skin_id"];
          if (c["x_buchde.mandant_id"])
            params["x_buchde.mandant_id"] = c["x_buchde.mandant_id"];

          await this.axiosInstance.get(c.login_form_url, { params });
          // We don't necessarily need the response, just the cookies set
        } catch (error) {
          // Ignore errors here? Some providers might not need this step.
          console.warn(
            "Optional GET to login_form_url failed, proceeding...",
            error.message
          );
          // this._debug(error.response);
        }
      }

      // 2. POST to the actual login endpoint
      const loginPayload = new URLSearchParams();
      loginPayload.append(c.login_form.username, username);
      loginPayload.append(c.login_form.password, password);
      for (const key in c.login_form.extra) {
        loginPayload.append(key, c.login_form.extra[key]);
      }

      try {
        const loginResponse = await this.axiosInstance.post(
          c.login_url,
          loginPayload.toString(),
          {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            maxRedirects: 5, // Allow some redirects during login
            validateStatus: (status) => status >= 200 && status < 400, // Accept 2xx and 3xx
          }
        );

        // Check if login was successful (e.g., by checking for the login cookie)
        const cookies = await this.cookieJar.getCookies(c.login_url);
        const loginCookie = cookies.find(
          (cookie) => cookie.key === c.login_cookie
        );

        if (!loginCookie) {
          // Sometimes the cookie might be set on a redirect URL domain
          const redirectUrl = loginResponse.headers["location"] || c.auth_url; // Guess where cookie might be
          const cookiesAfterRedirect = await this.cookieJar.getCookies(
            redirectUrl
          );
          const loginCookieAfterRedirect = cookiesAfterRedirect.find(
            (cookie) => cookie.key === c.login_cookie
          );
          if (!loginCookieAfterRedirect) {
            console.error("Login cookie not found after POST:", c.login_cookie);
            this._debug(loginResponse);
            throw new TolinoError(
              `Login to ${
                TolinoCloud.partnerName[this.partnerId]
              } failed. Cookie '${c.login_cookie}' not found.`
            );
          }
        }
        console.log("Partner site login successful.");
      } catch (error) {
        this._debug(error.response);
        throw new TolinoError(
          `Login POST to ${TolinoCloud.partnerName[this.partnerId]} failed.`,
          error.response?.data || error.message
        );
      }

      // --- Handle different auth flows post-login ---

      let authCode = null;

      if (c.tat_url) {
        // Special case for Buch.de (get token from HTML page)
        try {
          console.log("Attempting TAT URL flow...");
          const tatResponse = await this.axiosInstance.get(c.tat_url);
          const match = tatResponse.data.match(/&tat=([^%]+)%3D/); // Find base64 part
          if (!match || !match[1]) {
            throw new Error("Could not find TAT parameter in response.");
          }
          const b64 = match[1] + "=="; // Add padding if needed
          this.accessToken = Buffer.from(b64, "base64").toString("utf-8");
          console.log("TAT flow successful, got direct access token.");
          // Note: No refresh token or expiry in this flow from Python code
          this.refreshToken = null;
          this.tokenExpires = 0;
          return; // Skip the rest of the OAuth flow
        } catch (error) {
          this._debug(error.response);
          throw new TolinoError(
            "Failed to retrieve access token via TAT URL.",
            error.response?.data || error.message
          );
        }
      } else {
        // Standard OAuth2: Get Authorization Code
        try {
          console.log("Attempting OAuth2 Authorization Code flow...");
          const params = {
            client_id: c.client_id,
            response_type: "code",
            scope: c.scope,
            redirect_uri: c.reader_url,
          };
          if (c["x_buchde.skin_id"])
            params["x_buchde.skin_id"] = c["x_buchde.skin_id"];
          if (c["x_buchde.mandant_id"])
            params["x_buchde.mandant_id"] = c["x_buchde.mandant_id"];

          // Make the request but expect a redirect (3xx)
          const authResponse = await this.axiosInstance.get(c.auth_url, {
            params,
            maxRedirects: 0, // Crucial: Do not follow the redirect
            validateStatus: (status) => status >= 300 && status < 400, // Expect redirect
          });

          const location = authResponse.headers["location"];
          if (!location) {
            throw new Error("No location header found in auth response.");
          }

          const redirectUrl = new URL(location);
          authCode = redirectUrl.searchParams.get("code");

          if (!authCode) {
            console.error("Redirect URL:", location);
            throw new Error("Authorization code not found in redirect URL.");
          }
          console.log("OAuth code obtained.");
        } catch (error) {
          this._debug(error.response);
          throw new TolinoError(
            "OAuth authorization code request failed.",
            error.response?.data || error.message
          );
        }

        // 4. Exchange Authorization Code for Tokens
        try {
          const tokenPayload = new URLSearchParams({
            client_id: c.client_id,
            grant_type: "authorization_code",
            code: authCode,
            scope: c.scope,
            redirect_uri: c.reader_url, // Must match the one used to get the code
          }).toString();

          const tokenResponse = await this.axiosInstance.post(
            c.token_url,
            tokenPayload,
            {
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              // Expect a 200 OK here
              validateStatus: (status) => status === 200,
            }
          );

          const data = tokenResponse.data;
          if (!data.access_token) {
            throw new Error("No access_token in token response");
          }
          this.accessToken = data.access_token;
          this.refreshToken = data.refresh_token;
          this.tokenExpires = data.expires_in
            ? Date.now() + data.expires_in * 1000
            : 0;

          console.log("OAuth token exchange successful.");
        } catch (error) {
          this._debug(error.response);
          throw new TolinoError(
            "OAuth access token request failed.",
            error.response?.data || error.message
          );
        }
      }
    }
  }

  async logout() {
    if (this.useDevice) {
      console.log("Logout skipped for device mode.");
      return; // Logout doesn't apply same way for device tokens
    }

    const c = this.partnerConfig;

    if (c.revoke_url && this.refreshToken) {
      try {
        console.log("Attempting token revocation...");
        const revokePayload = new URLSearchParams({
          client_id: c.client_id,
          token_type: "refresh_token",
          token: this.refreshToken,
        }).toString();

        await this.axiosInstance.post(c.revoke_url, revokePayload, {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          validateStatus: (status) => status === 200,
        });
        console.log("Token revocation successful.");
      } catch (error) {
        this._debug(error.response);
        // Don't throw, just warn, as logout might still work via web
        console.warn(
          "Token revocation failed, attempting web logout.",
          error.message
        );
      }
    } else if (c.logout_url) {
      try {
        console.log("Attempting web logout...");
        await this.axiosInstance.post(c.logout_url, null, {
          // Often a POST with no body
          validateStatus: (status) =>
            status === 200 || (status >= 300 && status < 400), // Accept OK or redirect
        });
        console.log("Web logout successful.");
      } catch (error) {
        this._debug(error.response);
        throw new TolinoError(
          "Web logout failed.",
          error.response?.data || error.message
        );
      }
    } else {
      console.warn("No revoke_url or logout_url configured for this partner.");
    }

    // Clear local tokens regardless of API call success
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpires = 0;
    // Optionally clear cookies
    // this.cookieJar = new CookieJar(); // Creates a new empty jar
    // this.axiosInstance.defaults.jar = this.cookieJar;
  }

  // --- Device Management ---

  async register() {
    if (this.useDevice) {
      console.log("Registration skipped for device mode.");
      return;
    }
    if (!this.accessToken) throw new TolinoError("Not logged in.");

    const c = this.partnerConfig;
    const payload = { hardware_name: "tolino sync reader node" }; // Customize name

    try {
      await this.axiosInstance.post(c.register_url, payload, {
        headers: {
          "Content-Type": "application/json",
          t_auth_token: this.accessToken,
          hardware_id: TolinoCloud.hardwareId,
          reseller_id: String(this.partnerId),
          client_type: "TOLINO_WEBREADER", // Or a custom one?
          client_version: "4.4.1", // Match Python or use current?
          hardware_type: "HTML5", // Match Python
        },
        validateStatus: (status) => status === 200,
      });
      console.log(`Device ${TolinoCloud.hardwareId} registered successfully.`);
    } catch (error) {
      this._debug(error.response);
      throw new TolinoError(
        `Register device ${TolinoCloud.hardwareId} failed.`,
        error.response?.data || error.message
      );
    }
  }

  async unregister(deviceId = TolinoCloud.hardwareId) {
    if (this.useDevice) {
      console.log("Unregistration skipped for device mode.");
      return;
    }
    if (!this.accessToken) throw new TolinoError("Not logged in.");

    const c = this.partnerConfig;
    const payload = {
      deleteDevicesRequest: {
        accounts: [
          {
            auth_token: this.accessToken,
            reseller_id: this.partnerId,
          },
        ],
        devices: [
          {
            device_id: deviceId,
            reseller_id: this.partnerId, // Assuming device belongs to same partner
          },
        ],
      },
    };

    try {
      await this.axiosInstance.post(c.unregister_url, payload, {
        headers: {
          "Content-Type": "application/json",
          t_auth_token: this.accessToken, // May not be needed if in payload? Check API.
          reseller_id: String(this.partnerId),
        },
        validateStatus: (status) => status === 200,
      });
      console.log(`Device ${deviceId} unregistered successfully.`);
    } catch (error) {
      this._debug(error.response);
      const apiMessage = error.response?.data?.ResponseInfo?.message;
      throw new TolinoError(
        `Unregister device ${deviceId} failed: ${
          apiMessage || "Unknown reason"
        }`,
        error.response?.data || error.message
      );
    }
  }

  async devices() {
    if (!this.accessToken) throw new TolinoError("Not logged in.");

    const c = this.partnerConfig;
    const payload = {
      deviceListRequest: {
        accounts: [
          {
            auth_token: this.accessToken,
            reseller_id: this.partnerId,
          },
        ],
      },
    };

    try {
      const response = await this.axiosInstance.post(c.devices_url, payload, {
        headers: {
          "Content-Type": "application/json",
          t_auth_token: this.accessToken, // May not be needed? Check API.
          reseller_id: String(this.partnerId),
        },
        validateStatus: (status) => status === 200,
      });

      const deviceList = response.data?.deviceListResponse?.devices || [];
      return deviceList.map((item) => ({
        id: item.deviceId,
        name: item.deviceName,
        type: item.deviceType, // Keep original type string for now
        partner: parseInt(item.resellerId, 10),
        registered: parseInt(item.deviceRegistered, 10), // Timestamps?
        lastusage: parseInt(item.deviceLastUsage, 10), // Timestamps?
      }));
    } catch (error) {
      this._debug(error.response);
      throw new TolinoError(
        "Device list request failed.",
        error.response?.data || error.message
      );
    }
  }

  // --- Book Management ---

  _parseMetadata(item) {
    try {
      const meta = item?.epubMetaData; // Use optional chaining
      if (!meta) return null; // Skip if no metadata block

      const deliverable = meta.deliverable?.[0];
      if (!deliverable) return null; // Skip if no deliverable info

      const md = {
        partner: parseInt(item.resellerId, 10),
        // Use deliverableId if available (for uploads), fallback to identifier
        id: item.deliverableId || meta.identifier,
        title: meta.title || "Unknown Title",
        subtitle: meta.subtitle || null,
        author: meta.author?.map((a) => a.name) || [],
        mime: deliverable.contentFormat || null,
        type: meta.type?.toLowerCase() || "unknown", // e.g., 'ebook', 'edata'
        purchased: deliverable.purchased
          ? parseInt(deliverable.purchased, 10)
          : null, // Timestamp?
        issued: meta.issued ? parseInt(meta.issued, 10) : null, // Timestamp?
        // Add other potentially useful fields
        deliverableId: item.deliverableId || null, // Explicitly add this
        identifier: meta.identifier || null,
      };
      return md;
    } catch (parseError) {
      console.error("Could not parse metadata for item:", item, parseError);
      return null; // Return null for items that fail parsing
    }
  }

  async inventory() {
    if (!this.accessToken) throw new TolinoError("Not logged in.");

    const c = this.partnerConfig;
    try {
      const response = await this.axiosInstance.get(c.inventory_url, {
        params: { strip: "true" }, // Query parameters
        headers: {
          t_auth_token: this.accessToken,
          hardware_id: TolinoCloud.hardwareId,
          reseller_id: String(this.partnerId),
        },
        validateStatus: (status) => status === 200,
      });

      const inventoryData = response.data?.PublicationInventory;
      if (!inventoryData) {
        console.warn("Inventory response structure unexpected:", response.data);
        return [];
      }

      const edata = inventoryData.edata || [];
      const ebook = inventoryData.ebook || [];

      const allItems = [...edata, ...ebook];
      return allItems.map((item) => this._parseMetadata(item)).filter(Boolean); // Parse and remove nulls
    } catch (error) {
      this._debug(error.response);
      throw new TolinoError(
        "Inventory list request failed.",
        error.response?.data || error.message
      );
    }
  }

  /**
   * Uploads a book file.
   * @param {string} filePath - Absolute or relative path to the EPUB/PDF file.
   * @returns {Promise<string>} The deliverableId of the uploaded book.
   */
  async upload(filePath) {
    if (!this.accessToken) throw new TolinoError("Not logged in.");

    const c = this.partnerConfig;
    const fileName = path.basename(filePath);
    const fileExt = path.extname(filePath).toLowerCase().substring(1);

    let mimeType = "application/octet-stream"; // Default
    if (fileExt === "pdf") mimeType = "application/pdf";
    else if (fileExt === "epub") mimeType = "application/epub+zip";

    if (!fs.existsSync(filePath)) {
      throw new TolinoError(`File not found: ${filePath}`);
    }

    const form = new FormData();
    form.append("file", fs.createReadStream(filePath), {
      filename: fileName,
      contentType: mimeType,
    });

    try {
      const response = await this.axiosInstance.post(c.upload_url, form, {
        headers: {
          ...form.getHeaders(), // Includes Content-Type: multipart/form-data; boundary=...
          t_auth_token: this.accessToken,
          hardware_id: TolinoCloud.hardwareId,
          reseller_id: String(this.partnerId),
        },
        validateStatus: (status) => status === 200,
        maxContentLength: Infinity, // Allow large file uploads
        maxBodyLength: Infinity,
      });

      const deliverableId = response.data?.metadata?.deliverableId;
      if (!deliverableId) {
        console.error("Upload response missing deliverableId:", response.data);
        throw new Error("Upload response did not contain deliverableId.");
      }
      console.log(
        `File ${fileName} uploaded successfully. ID: ${deliverableId}`
      );
      return deliverableId;
    } catch (error) {
      this._debug(error.response);
      throw new TolinoError(
        `File upload failed for ${fileName}.`,
        error.response?.data || error.message
      );
    }
  }

  /**
   * Uploads a cover image for a book.
   * @param {string} bookId - The deliverableId of the book.
   * @param {string} coverPath - Path to the cover image file (PNG/JPEG).
   */
  async addCover(bookId, coverPath) {
    if (!this.accessToken) throw new TolinoError("Not logged in.");

    const c = this.partnerConfig;
    if (!c.cover_url) {
      throw new TolinoError("Cover upload not supported by this partner.");
    }

    const fileName = path.basename(coverPath);
    const fileExt = path.extname(coverPath).toLowerCase().substring(1);

    let mimeType = "image/jpeg"; // Default
    if (fileExt === "png") mimeType = "image/png";
    else if (fileExt === "jpg") mimeType = "image/jpeg";

    if (!fs.existsSync(coverPath)) {
      throw new TolinoError(`File not found: ${coverPath}`);
    }

    const form = new FormData();
    // The Python code uses '1092560016' as the field name for the file? Let's replicate that.
    // It also sends deliverableId as a separate field.
    form.append("file", fs.createReadStream(coverPath), {
      filename: fileName, // Does the filename matter here? Python used the book ID.
      contentType: mimeType,
    });
    form.append("deliverableId", bookId);

    try {
      await this.axiosInstance.post(c.cover_url, form, {
        headers: {
          ...form.getHeaders(),
          t_auth_token: this.accessToken,
          hardware_id: TolinoCloud.hardwareId,
          reseller_id: String(this.partnerId),
        },
        validateStatus: (status) => status === 200,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });
      console.log(`Cover ${fileName} added successfully for book ${bookId}.`);
    } catch (error) {
      this._debug(error.response);
      throw new TolinoError(
        `Cover upload failed for ${fileName}.`,
        error.response?.data || error.message
      );
    }
  }

  /**
   * Updates metadata for a specific book (usually one you uploaded).
   * @param {string} bookId - The deliverableId of the book.
   * @param {object} updates - An object with metadata fields to update (e.g., { title: 'New Title', author: 'New Author' }).
   *                           Supported fields based on Python: title, subtitle, author (string), publisher, isbn, edition (number), issued (Date object), language.
   * @returns {Promise<string>} The deliverableId of the updated book.
   */
  async updateMetadata(bookId, updates) {
    if (!this.accessToken) throw new TolinoError("Not logged in.");

    const c = this.partnerConfig;
    if (!c.meta_url) {
      throw new TolinoError("Metadata update not supported by this partner.");
    }

    const metaGetUrl = `${c.meta_url}/?deliverableId=${bookId}`;

    try {
      // 1. Get current metadata
      const getResponse = await this.axiosInstance.get(metaGetUrl, {
        headers: {
          t_auth_token: this.accessToken,
          hardware_id: TolinoCloud.hardwareId,
          reseller_id: String(this.partnerId),
        },
        validateStatus: (status) => status === 200,
      });

      const currentMeta = getResponse.data?.metadata;
      if (!currentMeta) {
        throw new Error("Could not retrieve current metadata.");
      }

      // 2. Apply updates
      const updatedMeta = { ...currentMeta };
      if (updates.title !== undefined)
        updatedMeta.title = String(updates.title);
      if (updates.subtitle !== undefined)
        updatedMeta.subtitle = String(updates.subtitle);
      // Author seems complex in Python (list of objects?), API might expect simple string here?
      // Let's assume a simple string update based on Python usage.
      if (updates.author !== undefined)
        updatedMeta.author = String(updates.author);
      if (updates.publisher !== undefined)
        updatedMeta.publisher = String(updates.publisher);
      if (updates.isbn !== undefined) updatedMeta.isbn = String(updates.isbn);
      if (updates.edition !== undefined)
        updatedMeta.edition = Number(updates.edition);
      if (updates.issued instanceof Date)
        updatedMeta.issued = Math.floor(updates.issued.getTime() / 1000); // Expects Unix timestamp (seconds)? Check API. Python used .timestamp()
      if (updates.language !== undefined)
        updatedMeta.language = String(updates.language);

      // 3. PUT updated metadata
      const payload = {
        uploadMetaData: updatedMeta,
      };
      const metaPutUrl = metaGetUrl; // PUT to the same URL

      const putResponse = await this.axiosInstance.put(metaPutUrl, payload, {
        headers: {
          "Content-Type": "application/json",
          t_auth_token: this.accessToken,
          hardware_id: TolinoCloud.hardwareId,
          reseller_id: String(this.partnerId),
        },
        validateStatus: (status) => status === 200,
      });

      const returnedId = putResponse.data?.metadata?.deliverableId || bookId; // Use returned ID if available
      console.log(`Metadata updated successfully for book ${returnedId}.`);
      return returnedId;
    } catch (error) {
      this._debug(error.response);
      throw new TolinoError(
        `Metadata update failed for book ${bookId}.`,
        error.response?.data || error.message
      );
    }
  }

  /**
   * Adds a book to a collection. Creates the collection if it doesn't exist.
   * @param {string} bookId - The deliverableId of the book.
   * @param {string} collectionName - The name of the collection.
   */
  async addToCollection(bookId, collectionName) {
    if (!this.accessToken) throw new TolinoError("Not logged in.");

    const c = this.partnerConfig;
    if (!c.sync_data_url) {
      throw new TolinoError(
        "Collections (sync-data) not supported by this partner."
      );
    }

    // The payload structure seems specific based on the Python code
    const payload = {
      revision: null, // Or fetch current revision first? Python uses null.
      patches: [
        {
          op: "add",
          value: {
            // revision: null, // Python commented this out
            modified: Date.now(), // Milliseconds timestamp
            name: collectionName,
            category: "collection",
            // transientId: Buffer.from(collectionName).toString('base64'), // Python legacy comment
          },
          path: `/publications/${bookId}/tags`, // Path indicates adding a tag (collection) to a book
        },
      ],
    };

    try {
      await this.axiosInstance.patch(c.sync_data_url, payload, {
        headers: {
          "Content-Type": "application/json",
          t_auth_token: this.accessToken,
          hardware_id: TolinoCloud.hardwareId,
          reseller_id: String(this.partnerId),
          client_type: "TOLINO_WEBREADER", // Required?
        },
        validateStatus: (status) => status === 200,
      });
      console.log(`Book ${bookId} added to collection '${collectionName}'.`);
    } catch (error) {
      this._debug(error.response);
      throw new TolinoError(
        `Failed to add book ${bookId} to collection '${collectionName}'.`,
        error.response?.data || error.message
      );
    }
  }

  async delete(bookId) {
    if (!this.accessToken) throw new TolinoError("Not logged in.");
    
    const c = this.partnerConfig;
    try {
      await this.axiosInstance.get(c.delete_url, {
        // Python uses GET for delete? Odd, but let's replicate.
        params: { deliverableId: bookId },
        headers: {
          t_auth_token: this.accessToken,
          hardware_id: TolinoCloud.hardwareId,
          reseller_id: String(this.partnerId),
        },
        validateStatus: (status) => status === 200,
      });
      console.log(`Book ${bookId} deleted successfully.`);
    } catch (error) {
      this._debug(error.response);
      const apiMessage = error.response?.data?.ResponseInfo?.message;
      throw new TolinoError(
        `Delete book ${bookId} failed: ${apiMessage || "Unknown reason"}`,
        error.response?.data || error.message
      );
    }
  }

  // --- Downloading ---

  async downloadInfo(bookId) {
    if (!this.accessToken) throw new TolinoError("Not logged in.");

    const c = this.partnerConfig;
    if (!c.downloadinfo_url) {
      throw new TolinoError(
        "Download info URL not configured for this partner."
      );
    }

    // Base64 encode the bookId for the URL path segments
    const b64Id = Buffer.from(bookId).toString("base64");
    // Remove padding '=' characters if the API doesn't like them
    const urlSafeB64Id = b64Id.replace(/=/g, "");

    // Format the URL - Python code had double slashes, replicate carefully
    // Example: https://.../rest//cloud/downloadinfo/{}/{}/type/external-download
    // It seems the book ID is used twice.
    const url = c.downloadinfo_url.replace(
      "{}/{}",
      `${urlSafeB64Id}/${urlSafeB64Id}`
    );

    try {
      const response = await this.axiosInstance.get(url, {
        headers: {
          t_auth_token: this.accessToken,
          hardware_id: TolinoCloud.hardwareId,
          reseller_id: String(this.partnerId),
        },
        validateStatus: (status) => status === 200,
      });

      const info = response.data?.DownloadInfo;
      if (!info || !info.contentUrl) {
        throw new Error("Download info response missing contentUrl.");
      }

      const contentUrl = info.contentUrl;
      // Extract filename - handle potential query params or fragments in URL
      let filename = "downloaded_file";
      try {
        filename = path.basename(new URL(contentUrl).pathname);
      } catch {
        // Fallback if URL parsing fails
        const urlParts = contentUrl.split("/");
        filename = urlParts[urlParts.length - 1].split("?")[0]; // Basic extraction
      }

      return {
        url: contentUrl,
        filename: filename || `download_${bookId}`, // Fallback filename
        filetype: info.format || null, // e.g., 'epub', 'pdf'
      };
    } catch (error) {
      this._debug(error.response);
      throw new TolinoError(
        `Download info request failed for book ${bookId}.`,
        error.response?.data || error.message
      );
    }
  }

  /**
   * Downloads a book file to the specified directory or file path.
   * @param {string} destinationPath - Directory to save the file in, or the full desired output file path.
   * @param {string} bookId - The deliverableId of the book to download.
   * @returns {Promise<string>} The full path to the downloaded file.
   */
  async download(destinationPath, bookId) {
    if (!this.accessToken) throw new TolinoError("Not logged in.");

    const { url: downloadUrl, filename: originalFilename } =
      await this.downloadInfo(bookId);

    let outputPath = destinationPath;
    // Check if destinationPath is a directory
    try {
      const stats = await fs.promises.stat(destinationPath);
      if (stats.isDirectory()) {
        outputPath = path.join(destinationPath, originalFilename);
      }
      // If it's not a directory, assume it's the full desired file path
    } catch (err) {
      console.error("Error checking destination path:", err.message);

      // If stat fails, it might be because the path doesn't exist yet.
      // If it looks like a directory path (ends with / or \), create it.
      // Otherwise, assume it's a full file path and the directory needs creating.
      const dir = path.dirname(destinationPath);
      if (destinationPath.endsWith(path.sep)) {
        await fs.promises.mkdir(destinationPath, { recursive: true });
        outputPath = path.join(destinationPath, originalFilename);
      } else {
        await fs.promises.mkdir(dir, { recursive: true });
        outputPath = destinationPath; // Use the provided path as the full file path
      }
    }

    console.log(
      `Downloading book ${bookId} (${originalFilename}) to ${outputPath}...`
    );

    const writer = fs.createWriteStream(outputPath);

    try {
      const response = await this.axiosInstance.get(downloadUrl, {
        responseType: "stream", // Crucial for downloading files
        headers: {
          // Include auth headers even for the direct download URL? Often needed.
          t_auth_token: this.accessToken,
          hardware_id: TolinoCloud.hardwareId,
          reseller_id: String(this.partnerId),
        },
        validateStatus: (status) => status === 200,
      });

      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on("finish", () => {
          console.log(`Download complete: ${outputPath}`);
          resolve(outputPath);
        });
        writer.on("error", (err) => {
          console.error("Error writing downloaded file:", err);
          // Clean up partially written file
          fs.unlink(outputPath, () => {}); // Ignore unlink errors
          reject(
            new TolinoError(
              `Failed to write downloaded file to ${outputPath}`,
              err
            )
          );
        });
        response.data.on("error", (err) => {
          console.error("Error during download stream:", err);
          reject(new TolinoError(`Download stream failed for ${bookId}`, err));
        });
      });
    } catch (error) {
      this._debug(error.response);
      // Clean up potentially created empty file on request error
      fs.unlink(outputPath, () => {}); // Ignore unlink errors
      const apiMessage = error.response?.data?.ResponseInfo?.message; // Check if error response has details
      throw new TolinoError(
        `Download request failed for book ${bookId}: ${
          apiMessage || "Unknown reason"
        }`,
        error.response?.data || error.message
      );
    }
  }

  /**
   * Manually set the access token (e.g., if obtained externally).
   * @param {string} token - The access token.
   */
  setToken(token) {
    this.accessToken = token;
    console.log("Access token manually set.");
  }
} // End of TolinoCloud class

export { TolinoCloud, TolinoError }; // Export the class and custom error
