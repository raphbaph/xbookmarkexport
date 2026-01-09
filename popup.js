const exportButton = document.getElementById("export-btn");
const statusEl = document.getElementById("status");
const endDateInput = document.getElementById("end-date");

function setStatus(message, isBusy = false) {
  if (!statusEl) return;
  statusEl.innerHTML = isBusy
    ? `<span class="spinner"></span>${message}`
    : message;
}

function downloadJson(data) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  chrome.downloads.download(
    {
      url,
      filename: "x-bookmarks.json",
      saveAs: false
    },
    () => {
      URL.revokeObjectURL(url);
      if (chrome.runtime.lastError) {
        console.error("Download failed:", chrome.runtime.lastError.message);
      }
    }
  );
}

async function requestExport() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    console.error("No active tab found.");
    setStatus("No active tab found.");
    return;
  }
  if (!tab.url || !tab.url.startsWith("https://x.com/i/bookmarks")) {
    setStatus("Open https://x.com/i/bookmarks and try again.");
    return;
  }

  const endDate = endDateInput && endDateInput.value ? endDateInput.value : null;
  exportButton.disabled = true;
  if (endDate) {
    setStatus(`Exporting bookmarks until ${endDate}...`, true);
  } else {
    setStatus("Starting export...", true);
  }
  const response = await sendExportMessage(tab.id, endDate);
  if (!response || !response.ok) {
    console.error("Export failed:", response && response.error);
    setStatus(response && response.error ? response.error : "Export failed.");
    exportButton.disabled = false;
    return;
  }

  setStatus("Downloading JSON...", true);
  downloadJson(response.data);
  setStatus(`Exported ${response.data.length} bookmarks.`);
  exportButton.disabled = false;
}

exportButton.addEventListener("click", () => {
  requestExport().catch((err) => {
    console.error("Export error:", err);
    setStatus("Unexpected error. Check console.");
    exportButton.disabled = false;
  });
});

chrome.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== "EXPORT_PROGRESS") return;
  if (message.phase === "scrolling") {
    const count = typeof message.count === "number" ? message.count : null;
    setStatus(
      count !== null ? `Loading bookmarks... (${count})` : "Loading bookmarks...",
      true
    );
  } else if (message.phase === "extracting") {
    setStatus("Extracting data...", true);
  }
});

function sendExportMessage(tabId, endDate) {
  return new Promise((resolve) => {
    const payload = { type: "EXPORT_BOOKMARKS", endDate };
    chrome.tabs.sendMessage(tabId, payload, (response) => {
      if (chrome.runtime.lastError) {
        const message = chrome.runtime.lastError.message || "";
        if (/Receiving end does not exist/i.test(message)) {
          chrome.scripting.executeScript(
            { target: { tabId }, files: ["content-script.js"] },
            () => {
              chrome.tabs.sendMessage(tabId, payload, (retryResponse) => {
                if (chrome.runtime.lastError) {
                  console.error("Message failed:", chrome.runtime.lastError.message);
                  setStatus("Open https://x.com/i/bookmarks and try again.");
                  resolve(null);
                  return;
                }
                resolve(retryResponse);
              });
            }
          );
          return;
        }
        console.error("Message failed:", message);
        setStatus("Open https://x.com/i/bookmarks and try again.");
        resolve(null);
        return;
      }
      resolve(response);
    });
  });
}
