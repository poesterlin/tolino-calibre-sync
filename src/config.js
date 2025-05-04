export const config = {
  calibre: {
    // IMPORTANT: Include http:// or https:// and remove trailing slash
    baseUrl:
      process.env.CALIBRE_BASE_URL,
    libraryId: process.env.CALIBRE_LIBRARY_ID || "books",
    username: process.env.CALIBRE_USERNAME,
    password: process.env.CALIBRE_PASSWORD,
    // Preferred format order for uploading
    preferredFormats: ["EPUB", "MOBI", "PDF"],
  },
  tolino: {
    partnerId: parseInt(process.env.TOLINO_PARTNER_ID || "3", 10), // Example: Thalia.de
    useDeviceLogin: true,
    hardwareId: process.env.TOLINO_HARDWARE_ID,
    refreshToken: process.env.TOLINO_REFRESH_TOKEN,
  },
  sync: {
    // Path to the state file
    stateFilePath: process.env.SYNC_STATE_FILE || "./sync-state.json",
    // Directory for temporary downloads
    downloadDir: process.env.SYNC_DOWNLOAD_DIR || "./downloads",
    // Set to true to enable deleting books from Tolino if they are removed from Calibre
    enableDeletions: process.env.SYNC_ENABLE_DELETIONS === "true" || false,
    // Set to true to attempt uploading covers
    uploadCovers: process.env.SYNC_UPLOAD_COVERS === "true" || true,
  },
};

// Basic validation
if (
  !config.calibre.baseUrl ||
  (config.tolino.useDeviceLogin &&
    (!config.tolino.hardwareId || !config.tolino.refreshToken)) ||
  (!config.tolino.useDeviceLogin &&
    (!config.tolino.username || !config.tolino.password))
) {
  console.error(
    "Error: Missing required configuration. Check config.js or .env file.",
  );
  process.exit(1);
}

// Add a check if only one auth field is provided (usually indicates an error)
if (
  (config.calibre.username && !config.calibre.password) ||
  (!config.calibre.username && config.calibre.password)
) {
  console.warn(
    "Warning: Calibre username or password provided without the other. Basic Auth might not work as expected.",
  );
}
