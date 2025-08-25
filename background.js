chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "GET_SID_COOKIE") {
    let url = "https://" + new URL(sender.tab.url).hostname;
    url = url.replace("lightning.force.com", "my.salesforce.com");
    console.log("URL : ", url);
    console.log(
      "Looks like: ",
      "https://prateekcom2-dev-ed.develop.my.salesforce.com"
    );
    // const url = "https://prateekcom2-dev-ed.develop.my.salesforce.com";  working URL

    chrome.cookies.get({ url, name: "sid" }, (cookie) => {
      if (cookie && cookie.value) {
        sendResponse({ sid: cookie.value, url: url });
      } else {
        sendResponse({ error: "SID cookie not found." });
      }
    });

    return true; // Keeps the message channel open
  }
});
