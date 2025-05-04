import fs from "fs/promises";
import path from "path";
import { pipeline } from "stream/promises";
import { TolinoCloud, TolinoError } from "./tolino-cloud.js";
import { config } from "./config.js";
import { fetchWithManualDigest } from "./request.js";
import { Readable } from "stream";
import { createWriteStream } from "fs";

/**
 * Loads the sync state from the JSON file.
 * @returns {Promise<object>} The sync state object (Calibre UUID -> Tolino ID).
 */
async function loadSyncState() {
  try {
    const data = await fs.readFile(config.sync.stateFilePath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log("Sync state file not found, starting fresh.");
      return {}; // Return empty object if file doesn't exist
    }
    console.error(
      `Error loading sync state from ${config.sync.stateFilePath}:`,
      error
    );
    throw error; // Re-throw other errors
  }
}

/**
 * Saves the sync state to the JSON file.
 * @param {object} state - The sync state object to save.
 */
async function saveSyncState(state) {
  try {
    await fs.writeFile(
      config.sync.stateFilePath,
      JSON.stringify(state, null, 2), // Pretty print JSON
      "utf-8"
    );
    console.log(`Sync state saved to ${config.sync.stateFilePath}`);
  } catch (error) {
    console.error(
      `Error saving sync state to ${config.sync.stateFilePath}:`,
      error
    );
    // Decide if you want to throw or just log
  }
}
async function fetchCalibreBooks() {
    const url = `${config.calibre.baseUrl}/interface-data/books-init?library_id=${config.calibre.libraryId}&sort=timestamp.desc`;
    console.log(`Fetching book list from Calibre: ${url}`);
    let response;
    try {
      // Use the manual Digest helper
      response = await fetchWithManualDigest(url, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          // signal: AbortSignal.timeout(30000) // Example timeout
      }, { username: config.calibre.username, password: config.calibre.password }); // Pass credentials
  
      if (!response.ok) {
          const errorText = await response.text().catch(() => 'Could not read error body');
          throw new Error(`HTTP error ${response.status} ${response.statusText}: ${errorText}`);
      }
  
      const responseData = await response.json();
  
      if (responseData && responseData.metadata) {
        console.log(`Fetched metadata for ${Object.keys(responseData.metadata).length} books from Calibre.`);
        return responseData.metadata;
      } else {
        console.error("Unexpected response structure from Calibre:", responseData);
        throw new Error("Invalid response structure from Calibre API");
      }
    } catch (error) {
      console.error("Error fetching data from Calibre:", error.message);
      if (response?.status === 401) {
          console.error("Calibre Response: Authentication failed (401). Check username/password or Digest implementation.");
      } else if (response?.status) {
          console.error("Calibre Response Status:", response.status);
      }
      throw new Error(`Failed to fetch book list from Calibre: ${error.message}`);
    }
  }
  
  // --- Refactor downloadFromCalibre using manual Digest ---
  async function downloadFromCalibre(type, calibreBookId, destinationPath) {
    const url = `${config.calibre.baseUrl}/get/${type}/${calibreBookId}/${config.calibre.libraryId}`;
    console.log(`Downloading ${type} for Calibre ID ${calibreBookId} from ${url}`);
    let response;
    try {
      // Use the manual Digest helper
      response = await fetchWithManualDigest(url, {
          method: 'GET',
          // signal: AbortSignal.timeout(120000) // Example timeout
      }, { username: config.calibre.username, password: config.calibre.password }); // Pass credentials
  
      if (!response.ok) {
          const errorText = await response.text().catch(() => 'Could not read error body');
          throw new Error(`HTTP error ${response.status} ${response.statusText}: ${errorText}`);
      }
  
      if (!response.body) {
          throw new Error('Response body is null, cannot download file.');
      }
  
      const bodyNodeStream = Readable.fromWeb(response.body);
      const writer = createWriteStream(destinationPath);
      await pipeline(bodyNodeStream, writer);
  
      console.log(`Successfully downloaded to ${destinationPath}`);
      return destinationPath;
  
    } catch (error) {
      console.error(`Error downloading ${type} for Calibre ID ${calibreBookId}:`, error.message);
      if (response?.status === 401) {
          console.error("Calibre Download Response: Authentication failed (401). Check username/password or Digest implementation.");
      } else if (response?.status) {
          console.error("Calibre Download Response Status:", response.status);
      }
      try { await fs.unlink(destinationPath); } catch (unlinkError) { if (unlinkError.code !== 'ENOENT') console.warn(`Could not delete partial download ${destinationPath}:`, unlinkError.message); }
      throw new Error(`Failed to download ${type} for Calibre ID ${calibreBookId}: ${error.message}`);
    }
  }

// --- Main Sync Logic ---

async function main() {
  console.log("Starting Calibre to Tolino Sync...");
  let tolino = null;
  let currentState = {};
  const stats = { uploaded: 0, deleted: 0, errors: 0, covers: 0 };

  try {
    // 0. Ensure download directory exists
    await fs.mkdir(config.sync.downloadDir, { recursive: true });

    // 1. Load existing state
    currentState = await loadSyncState();

    // 2. Initialize and Login to Tolino
    console.log(
      `Initializing Tolino client for partner ${config.tolino.partnerId}...`
    );
    tolino = new TolinoCloud(
      config.tolino.partnerId,
      config.tolino.useDeviceLogin || false
    );

    console.log("Logging into Tolino...");
    if (config.tolino.useDeviceLogin) {
      await tolino.login(config.tolino.hardwareId, config.tolino.refreshToken);
    } else {
      await tolino.login(config.tolino.username, config.tolino.password);
    }
    console.log("Tolino login successful.");

    // 3. Fetch current libraries
    const calibreBooks = await fetchCalibreBooks(); // Keyed by Calibre ID
    const tolinoInventory = await tolino.inventory(); // Array of objects

    // Create maps for easier lookup
    const calibreBooksByUuid = {};
    for (const id in calibreBooks) {
      if (calibreBooks[id].uuid) {
        calibreBooksByUuid[calibreBooks[id].uuid] = {
          ...calibreBooks[id],
          calibreId: id, // Add calibre ID for convenience
        };
      } else {
        console.warn(
          `Book with Calibre ID ${id} (Title: ${calibreBooks[id].title}) is missing UUID. Skipping.`
        );
      }
    }
    const calibreUuids = new Set(Object.keys(calibreBooksByUuid));

    // Map Tolino inventory by deliverableId for easier lookup during deletion check
    const tolinoBooksById = tolinoInventory.reduce((acc, book) => {
      if (book.id) {
        // Tolino's 'id' is the deliverableId
        acc[book.id] = book;
      }
      return acc;
    }, {});

    // 4. Identify books to upload
    const booksToUpload = [];
    for (const uuid in calibreBooksByUuid) {
      if (!currentState[uuid]) {
        // Book UUID not found in our state file -> needs upload
        booksToUpload.push(calibreBooksByUuid[uuid]);
      }
      // TODO: Add logic here to check last_modified for updates if needed
    }
    console.log(`Identified ${booksToUpload.length} books to upload.`);

    // 5. Identify books to delete (optional)
    const booksToDelete = [];
    if (config.sync.enableDeletions) {
      for (const uuid in currentState) {
        if (!calibreUuids.has(uuid)) {
          // UUID from state file is no longer in Calibre library
          const tolinoId = currentState[uuid];
          // Double-check if it actually exists in Tolino's current inventory
          if (tolinoBooksById[tolinoId]) {
            booksToDelete.push({
              uuid: uuid,
              tolinoId: tolinoId,
              title: tolinoBooksById[tolinoId].title || "Unknown Title",
            });
          } else {
            console.warn(
              `Book UUID ${uuid} (Tolino ID ${tolinoId}) marked for deletion, but not found in current Tolino inventory. Removing from state.`
            );
            delete currentState[uuid]; // Clean up state file
          }
        }
      }
      console.log(
        `Identified ${booksToDelete.length} books to delete from Tolino.`
      );
    }

    // --- Execute Actions ---

    // Upload new books
    for (const book of booksToUpload) {
      console.log(
        `\nProcessing UPLOAD for: ${book.title} (UUID: ${book.uuid})`
      );
      let uploadedTolinoId = null;
      let tempFilePath = null;
      let tempCoverPath = null;

      try {
        // a. Find preferred format
        let formatToUpload = null;
        let formatFileName = null;
        for (const fmt of config.calibre.preferredFormats) {
          if (book.formats.includes(fmt)) {
            formatToUpload = fmt;
            // Construct expected filename (Calibre usually uses title - author.format)
            // This is just for the temp file, Tolino upload uses its own logic
            formatFileName = `${book.title} - ${book.authors.join(
              ", "
            )}.${fmt.toLowerCase()}`;
            // Sanitize filename (basic)
            formatFileName = formatFileName.replace(/[\\?%*:|"<>]/g, "_");
            break;
          }
        }

        if (!formatToUpload) {
          console.warn(
            `Skipping upload for "${
              book.title
            }": No suitable format found (${book.formats.join(
              ", "
            )}). Preferred: ${config.calibre.preferredFormats.join(", ")}`
          );
          continue;
        }

        // b. Download format from Calibre
        tempFilePath = path.join(
          config.sync.downloadDir,
          `book_${book.calibreId}_${Date.now()}.${formatToUpload.toLowerCase()}`
        );
        await downloadFromCalibre(formatToUpload, book.calibreId, tempFilePath);

        // c. Upload to Tolino
        console.log(`Uploading ${formatToUpload} to Tolino...`);
        uploadedTolinoId = await tolino.upload(tempFilePath);
        console.log(
          `Successfully uploaded to Tolino. New ID: ${uploadedTolinoId}`
        );
        stats.uploaded++;

        // d. Update state immediately
        currentState[book.uuid] = uploadedTolinoId;
        await saveSyncState(currentState); // Save after each successful upload

        // e. Upload Cover (optional)
        if (config.sync.uploadCovers) {
          try {
            tempCoverPath = path.join(
              config.sync.downloadDir,
              `cover_${book.calibreId}_${Date.now()}.jpg`
            );
            await downloadFromCalibre("thumb", book.calibreId, tempCoverPath);
            console.log(
              `Uploading cover to Tolino for ID ${uploadedTolinoId}...`
            );
            await tolino.addCover(uploadedTolinoId, tempCoverPath);
            console.log("Cover uploaded successfully.");
            stats.covers++;
          } catch (coverError) {
            console.error(
              `Failed to download or upload cover for "${book.title}" (Tolino ID: ${uploadedTolinoId}):`,
              coverError.message
            );
            // Don't count as a main error, just log it
          }
        }

        // f. TODO: Update Metadata (optional)
        // Example: await tolino.updateMetadata(uploadedTolinoId, { title: book.title, author: book.authors.join(', ') });
      } catch (error) {
        console.error(
          `\n--- ERROR processing upload for "${book.title}" (UUID: ${book.uuid}) ---`
        );
        console.error(error.message);
        stats.errors++;
        // If upload failed but we got an ID somehow, remove from state? Unlikely.
        // If upload succeeded but cover/metadata failed, the state is already saved.
      } finally {
        // g. Cleanup temporary files
        if (tempFilePath) {
          try {
            await fs.unlink(tempFilePath);
          } catch {
            /* ignore */
          }
        }
        if (tempCoverPath) {
          try {
            await fs.unlink(tempCoverPath);
          } catch {
            /* ignore */
          }
        }
      }
    }

    // Delete books removed from Calibre
    if (config.sync.enableDeletions) {
      for (const book of booksToDelete) {
        console.log(
          `\nProcessing DELETE for: ${book.title} (Tolino ID: ${book.tolinoId}, Calibre UUID: ${book.uuid})`
        );
        try {
          await tolino.delete(book.tolinoId);
          console.log(`Successfully deleted from Tolino.`);
          delete currentState[book.uuid]; // Remove from state *after* successful deletion
          stats.deleted++;
          await saveSyncState(currentState); // Save state after deletion
        } catch (error) {
          console.error(
            `\n--- ERROR processing delete for "${book.title}" (Tolino ID: ${book.tolinoId}) ---`
          );
          console.error(error.message);
          stats.errors++;
          // Should we remove from state even if delete failed? Maybe not.
        }
      }
    }
  } catch (error) {
    console.error("\n\n--- FATAL SYNC ERROR ---");
    if (error instanceof TolinoError) {
      console.error("Tolino Error:", error.message);
      if (error.cause) console.error("Cause:", error.cause);
    } else {
      console.error("Error:", error.message);
      console.error(error.stack); // Print stack for unexpected errors
    }
    stats.errors++;
  } finally {
    // 6. Logout from Tolino
    if (tolino && (tolino.accessToken || tolino.refreshToken)) {
      try {
        console.log("\nLogging out from Tolino...");
        await tolino.logout();
        console.log("Tolino logout complete.");
      } catch (logoutError) {
        console.error("Tolino logout failed:", logoutError.message);
      }
    }

    // 7. Final state save (in case deletions happened)
    // Note: State is saved after each successful upload/delete now,
    // but a final save doesn't hurt.
    await saveSyncState(currentState);

    console.log("\n--- Sync Summary ---");
    console.log(`Books Uploaded: ${stats.uploaded}`);
    console.log(`Covers Uploaded: ${stats.covers}`);
    console.log(`Books Deleted: ${stats.deleted}`);
    console.log(`Errors Encountered: ${stats.errors}`);
    console.log("--------------------");

    if (stats.errors > 0) {
      process.exitCode = 1; // Indicate failure
    }

    console.log("Sync process completed.");
    console.log("Waiting...");

    // Keep the process alive for a while to see logs
    const syncInterval = 1000 * 60 * 60; // 1 hour
    await new Promise((resolve) => setTimeout(resolve, syncInterval));
  }
}

// --- Run the main function ---
main();
