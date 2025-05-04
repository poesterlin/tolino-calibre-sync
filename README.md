# Tolino Calibre Sync

Synchronize your Calibre library with the Tolino Cloud.

## Features

- Uploads new books from Calibre to Tolino Cloud.
- Uploads covers for uploaded books.
- Uses Calibre UUIDs to track synced books and avoid duplicates.
- (Optional) Deletes books from Tolino Cloud if they are removed from Calibre.
- Supports Calibre servers requiring HTTP Digest.

## Setup

1.  **Prerequisites:** Docker and Docker Compose installed on your system. Calibre Content Server running and accessible using a Username + Password.
2.  **Configure:**
    - Copy the `.env.example` file to `.env`.
    - Edit the `.env` file with your specific Calibre and Tolino details (see comments within the file).
3.  **Start the setup:**
      ```bash
      docker-compose up
      ```

## Configuration (`.env` file)

See the comments in the `.env.example` file for detailed explanations of each setting. Key sections include:

- **Calibre Server:** `CALIBRE_BASE_URL`, `CALIBRE_LIBRARY_ID`, `CALIBRE_USERNAME`, `CALIBRE_PASSWORD`.
- **Tolino Cloud:** `TOLINO_PARTNER_ID`.
- **Tolino Authentication:** Choose **one** method (Username/Password OR Device/Refresh Token).
- **Sync Behavior:** `SYNC_STATE_FILE`, `SYNC_DOWNLOAD_DIR`, `SYNC_ENABLE_DELETIONS`, `SYNC_UPLOAD_COVERS`.

## Authentication Methods

You need to configure how the script authenticates with your Tolino Cloud account. Choose **one** of the following methods in your `.env` file.

###  Device Login / Refresh Token (Workaround for Bot Blocking)

This method uses credentials (a `hardware_id` and a `refresh_token`) obtained from a successful login session in your web browser. 

**Steps to Obtain Credentials:**

1.  Open your Tolino partner's **Web Reader** in your web browser (e.g., Chrome, Firefox).
2.  **Before logging in**, open your browser's **Developer Tools** (usually by pressing `F12`).
3.  Navigate to the **Network** tab within the Developer Tools. Ensure network recording is active (usually a red circle or similar). You might want to check the "Preserve log" option.
4.  Now, **log in** to the Tolino Web Reader using your normal username and password through the web interface.
5.  Look through the network requests list in the Developer Tools. You need to find two specific pieces of information:
    - **Hardware ID:** Use the search/filter bar in the Network tab and search for `registerhw`. Look in the **Request Headers** section for a header named `hardware_id`. Copy its value (it will look something like `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` or similar).
    - **Refresh Token:** Use the search/filter bar again and search for `token`. Find the request made to an endpoint like `/auth/oauth2/token`. Click on this request. Look in the **Response** or **Preview** tab for the JSON response body. Find the key named `refresh_token` and copy its value (it will be a long string, often resembling a UUID).
6.  **Important:** Do not explicitly log out of the Web Reader session in your browser while performing these steps, although the refresh token should ideally remain valid even after you close the browser.

**Configure the Script:**

1.  Edit your `.env` file.
2.  Set `TOLINO_HARDWARE_ID` to the `hardware_id` value you copied.
3.  Set `TOLINO_REFRESH_TOKEN` to the `refresh_token` value you copied.
4.  **Ensure `TOLINO_USERNAME` and `TOLINO_PASSWORD` are commented out or empty.**
5.  Make sure the `TOLINO_PARTNER_ID` is set correctly for the account you logged into in the Web Reader.

The script will now use the `hardware_id` and `refresh_token` to authenticate directly with the Tolino API, bypassing the interactive login page.

**Note:** Refresh tokens can eventually expire (though they often last a long time). If the script starts failing with authentication errors using this method after a while, you may need to repeat the process above to obtain a new refresh token.

The sync process with run every hour and will check for new books in your Calibre library and upload them to the Tolino Cloud.

## Development

### Prerequisites

- Bun.js installed. Get it from [bun.sh](https://bun.sh/).
- `bun install` to install dependencies.
- `bun run dev` to start the development watcher.

## Credits

I used the [tolino-calibre-sync project from darkphoenix](https://github.com/darkphoenix/tolino-calibre-sync) to write Javascript version that is using the calibre content server instead of calibre directly. 
