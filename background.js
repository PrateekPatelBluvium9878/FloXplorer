chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "GET_SID_COOKIE") {
    //const url = "https://" + new URL(sender.tab.url).hostname;

    const url = "https://prateekcom2-dev-ed.develop.my.salesforce.com";

    chrome.cookies.get({ url, name: "sid" }, (cookie) => {
      if (cookie && cookie.value) {
        sendResponse({ sid: cookie.value, url: url});
      } else {
        sendResponse({ error: "SID cookie not found." });
      }
    });

    return true; // Keeps the message channel open
  }
});
