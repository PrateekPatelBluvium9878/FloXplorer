(function () {
  if (document.getElementById("flow-helper-button")) return;

  //******** Declaring constant variables ***************/
  const logoUrl = chrome.runtime.getURL("Logo.png");
  const CHAT_STORAGE_KEY = "flow-assistant-chat";
  const defaultMessage = {
    sender: "bot",
    text: "🔄 Fetching the current open version of your flow... Hang tight!",
    messageType: "fetchingXML",
  };

  const button = document.createElement("div");
  button.id = "flow-helper-button";
  button.title = "Open FloXplorer";
  button.innerHTML = `<img src="${logoUrl}" alt="Open FloXplorer"/>`;

  const panel = document.createElement("div");
  panel.id = "flow-helper-panel";
  panel.innerHTML = `
      <div class="panel-header">
        <span class="panel-title">🤖 FloXplorer</span>
        <button class="reset-chat-btn" title="Reset Chat">⟳</button>
      </div>
      <div class="panel-body">
        <div class="chat-body" style="display: none;">
          <div class="chat-history"></div>
          <div class="chat-input-box">
            <input type="text" placeholder="Ask something about this flow..." />
            <button class="send-btn">Send</button>
          </div>
        </div>
      </div>
  `;

  //******** Declaring variables ***************/
  let shortSummary;
  let longSummary;
  let chatHistory;
  let isAuthenticated;
  let isOpen;
  let haveLatestXml;
  let xml;

  function resetVariables() {
    shortSummary = "";
    longSummary = "";
    chatHistory = [];
    isAuthenticated = false;
    isOpen = false;
    haveLatestXml = false;
    xml = "";
  }

  //deprecated
  function loadChat() {
    //const saved = localStorage.getItem(CHAT_STORAGE_KEY);
    // chatHistory = saved ? JSON.parse(saved) : [...defaultMessages];
    // chatHistory.push(defaultMessage);
  }

  //deprecated
  function saveChat() {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatHistory));
  }

  function renderChat() {
    const historyEl = panel.querySelector(".chat-history");
    historyEl.innerHTML = chatHistory
      .map((entry) => {
        const sideClass = entry.sender === "bot" ? "bot" : "user";
        const optionsHTML = entry.options
          ? `<div class="option-button-section">
            ${entry.options
              .map(
                (opt, idx) => `
            <button class="option-button" data-label="${opt.label}">
              <span class="circle">${idx + 1}</span> ${opt.label}
            </button>`
              )
              .join("")}
          </div>`
          : "";

        const textContent = entry.isTyping
          ? `<span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>`
          : entry.text;

        return `
        <div class="message-box ${sideClass}">
          <div class="chatbot-text">${textContent}</div>
          ${optionsHTML}
        </div>
      `;
      })
      .join("");

    historyEl.scrollTop = historyEl.scrollHeight;

    const lastMessage = chatHistory[chatHistory.length - 1];
    const hasOptions = lastMessage && lastMessage.options;
    const input = panel.querySelector(".chat-input-box input");
    const sendBtn = panel.querySelector(".chat-input-box .send-btn");
    const inputBox = panel.querySelector(".chat-input-box");

    if (hasOptions) {
      input.disabled = true;
      sendBtn.disabled = true;
      inputBox.classList.add("disabled");
    } else {
      input.disabled = false;
      sendBtn.disabled = false;
      inputBox.classList.remove("disabled");
    }

    //saveChat();
  }

  //Fetch latest flow XML and call LLM for Summary
  function prepareChatbot() {
    chrome.runtime.sendMessage({ type: "GET_SID_COOKIE" }, (response) => {
      if (response?.sid) {
        isAuthenticated = true;
        panel.querySelector(".chat-body").style.display = "block";
        renderChat();

        console.log("Session ID Chirag lets go:", response.sid);
        console.log("url ID Chirag lets go:", response.url);

        const flowId = getFlowIdFromUrl();
        console.log("*********printing flowid*********", flowId);
        if (flowId) {
          fetchFlowMetadata(response.sid, flowId)
            .then((metadata) => {
              haveLatestXml = true;
              console.log("in then of fetching flowmetadata");
              xml = jsonToXml(metadata, "FlowMetadata");
              callPerplexityApiforSummaries();
              console.log("complete response of flowmetadata", xml);
              renderChat();
            })
            .catch((err) => {
              chatHistory.push({
                sender: "bot",
                text: `⚠️ Error fetching metadata: ${err.message} ${flowId}`,
                messageType: "error",
              });
              renderChat();
            });
        } else {
          chatHistory.push({
            sender: "bot",
            text: `⚠️ Couldn't extract Flow ID from URL.`,
            messageType: "error",
          });
          renderChat();
        }
      } else {
        const msg = document.createElement("div");
        msg.className = "sf-auth-warning";
        msg.style = "padding: 10px; color: #c00;";
        msg.textContent = "Failed to get the sessionid.";
        panel.querySelector(".panel-body").appendChild(msg);
      }
    });
  }

  //fetch flow Id from URL
  function getFlowIdFromUrl() {
    try {
      const url = new URL(window.location.href);
      return url.searchParams.get("flowId");
    } catch (e) {
      console.error("Failed to extract flowId from URL", e);
      return null;
    }
  }

  //make TOOLING Api call to fetch flow xml metadata
  async function fetchFlowMetadata(sessionId, flowId) {
    const instanceUrl = window.location.origin.replace(
      ".lightning.force.com",
      ".my.salesforce.com"
    );
    const apiVersion = "58.0";
    const query = `SELECT Id, Metadata FROM Flow WHERE Id='${flowId}'`;
    const url = `${instanceUrl}/services/data/v${apiVersion}/tooling/query/?q=${encodeURIComponent(
      query
    )}`;

    console.log("Session id:", sessionId);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${sessionId}`,
        "Content-Type": "application/json",
      },
    });

    console.log("--------Tooling APi Resposne: ", response);

    if (!response.ok) {
      throw new Error("Metadata fetch failed");
    }

    const data = await response.json();
    return data.records?.[0]?.Metadata;
  }

  //convert json metadata to xml
  function jsonToXml(obj, nodeName = "root") {
    if (obj === null || obj === undefined) return "";

    let xml = "";

    if (typeof obj === "object" && !Array.isArray(obj)) {
      xml += `<${nodeName}>`;
      for (const key in obj) {
        if (
          obj.hasOwnProperty(key) &&
          obj[key] !== null &&
          obj[key] !== undefined
        ) {
          xml += jsonToXml(obj[key], key);
        }
      }
      xml += `</${nodeName}>`;
    } else if (Array.isArray(obj)) {
      for (const item of obj) {
        xml += jsonToXml(item, nodeName);
      }
    } else {
      xml += `<${nodeName}>${String(obj)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")}</${nodeName}>`;
    }

    return xml;
  }

  function loadingResponse() {
    chatHistory.push({
      sender: "bot",
      text: "typing",
      isTyping: true,
      messageType: "loading",
    });
    renderChat();
  }

  function responseLoaded() {
    chatHistory.pop();
  }

  async function callPerplexityToAnswerUserPrompt(userText) {
    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
    // const apiKey = "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"; // Replace with your actual key

    const bodytext = `### 1. Question
${userText}

### 2. Instructions
- Carefully analyze the provided Salesforce Flow XML.
- Identify the component or components most relevant to the user's question.
- Use the **component label** (not the component name) when referring to components in the response.
- If multiple components are relevant, include each of their labels — all must be wrapped in <strong> tags.
- Use the name of the **triggering object** (from the <object> tag); do not use the word "Record".
- Each component label **must be wrapped in HTML bold tags** like this: <strong>Component Label</strong>.
- Keep the explanation **short, clear, and no more than 3 lines**.
- Only answer what the user asks — do not add unrelated context or additional explanations.

### XML:
${xml}

### 3. Response Format (strictly in JSON)
{
  "Component_Name": "Label of the most relevant flow component, or a comma-separated list if more than one",
  "response": "Short explanation (max 3 lines) using the component label and triggering object name. Avoid the word 'Record'."
}`;

    console.log("xml in chat: ", xml);
    const body = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: JSON.stringify(bodytext),
            },
          ],
        },
      ],
    };

    console.log("body in chat: ", body);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": "AIzaSyCvy9qo6DJhF5Ry9ecNGPjAuywh3ZyeGZE",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();
      console.log("Full Gemini API response:", JSON.stringify(response));

      // Step 1: Get first candidate safely
      const candidate = data?.candidates?.[0];
      if (!candidate) throw new Error("No candidates in Gemini response");

      // Step 2: Extract text from all parts (in case there are multiple)
      const parts = candidate.content?.parts || [];
      const combinedText = parts
        .map((p) => p.text)
        .join("\n")
        .trim();

      if (!combinedText) throw new Error("No content returned from Gemini");

      // Step 3: Remove Markdown fences (```json ... ```)
      const cleaned = combinedText.replace(/```json\n?|\n?```/g, "");
      console.log("cleaned : ", cleaned);

      try {
        responseLoaded();
        const finalChat = JSON.parse(cleaned);
        chatHistory.push({
          sender: "bot",
          text: finalChat.response,
          messageType: "response",
        });

        //highlightFlowComponentByLabel(parsed.Component_Name);
      } catch (err) {
        console.error(err);
      }

      renderChat();
    } catch (error) {
      chatHistory.push({
        sender: "bot",
        text: `❌ Error: ${error.message}`,
        messageType: "error",
      });
      renderChat();
    }
  }

  async function callPerplexityApiforSummaries() {
    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
    // const apiKey = "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"; // Replace with your actual key

    const body = {
      contents: [
        {
          parts: [
            {
              text: `Here is a Salesforce Flow XML:\n${xml}\n\nBased on this, provide me a JSON output in the following format:\n{\n  "name": "flow name",\n  "version": "version of flow",\n  "isActive": "is that version active",\n  "short description": "...",\n  "long description": "...",\n  "possible questions": "...",\n  "questions": []\n}`,
            },
          ],
        },
      ],
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": "AIzaSyCvy9qo6DJhF5Ry9ecNGPjAuywh3ZyeGZE",
        },
        body: JSON.stringify(body),
      });

      console.log("----------reponse: ", response);

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();

      try {
        // ✅ Extract text safely
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) {
          throw new Error("No candidates returned from Gemini API");
        }

        // ✅ Clean Markdown fences (```json ... ```)
        const cleaned = rawText.replace(/```json\n?|\n?```/g, "");

        // ✅ Parse JSON
        const parsed = JSON.parse(cleaned);

        // ✅ Retrieve descriptions
        shortSummary =
          parsed["short description"] || "Short summary not found.";
        longSummary = parsed["long description"] || "Long summary not found.";
      } catch (err) {
        console.log("Error while parsing: ", err);
        console.log("Data: ", data);
        shortSummary = "❌ Failed to parse short summary.";
        longSummary = "❌ Failed to parse long summary.";
      }

      chatHistory.push({
        sender: "bot",
        text: "What would you like to see?",
        options: [{ label: "Short Summary" }, { label: "Long Summary" }],
        messageType: "options",
      });

      renderChat();
    } catch (error) {
      chatHistory.push({
        sender: "bot",
        text: `❌ Error: ${error.message}`,
        messageType: "error",
      });
      renderChat();
    }
  }

  //deprecated
  function refreshChatWithMetadata(metadata) {
    const xml = jsonToXml(metadata, "FlowMetadata");
    chatHistory.length = 0;
    pushChatMessage(
      "bot",
      `<strong>Flow Metadata (XML):</strong><pre>${xml}</pre>`
    );

    sendToPerplexity(xml).then(() => {
      renderChat(); // Update UI with any new available options
    });
  }

  function handleOptionClick(label) {
    switch (label) {
      case "Short Summary":
        if (shortSummary) {
          chatHistory.push({
            sender: "user",
            text: `Short Summary`,
            messageType: "userInput",
          });
          chatHistory.push({
            sender: "bot",
            text: `<strong>Short Summary:</strong><p>${shortSummary}</p>`,
            messageType: "summaryResponse",
          });
        } else {
          chatHistory.push({
            sender: "bot",
            text: "Short summary not available yet.",
            messageType: "summaryResponse",
          });
        }
        break;

      case "Long Summary":
        if (longSummary) {
          chatHistory.push({
            sender: "user",
            text: `Long Summary`,
            messageType: "userInput",
          });
          chatHistory.push({
            sender: "bot",
            text: `<strong>Long Summary:</strong><p>${longSummary}</p>`,
            messageType: "summaryResponse",
          });
        } else {
          chatHistory.push({
            sender: "bot",
            text: "Long summary not available yet.",
            messageType: "summaryResponse",
          });
        }
        break;

      case "Ask Another Question":
        chatHistory.push({
          sender: "bot",
          text: "Sure! Type your question in the input box.",
          messageType: "options",
        });
        break;

      // Add more cases for other options
      default:
        chatHistory.push({
          sender: "bot",
          text: `⚠️ Unrecognized option: ${label}`,
          messageType: "error",
        });
    }

    renderChat();
  }

  function highlightFlowComponentByLabel(label) {
    // Wait for the DOM to load (Flow canvas can take time)
    const interval = setInterval(() => {
      const allNodes = document.querySelectorAll("[data-component-label]");

      for (const node of allNodes) {
        const compLabel = node.getAttribute("data-component-label")?.trim();
        if (compLabel === label) {
          node.classList.add("sf-flow-glow");
          clearInterval(interval);
          return;
        }
      }
    }, 500);

    // Optional: stop after 10 seconds if not found
    setTimeout(() => clearInterval(interval), 10000);
  }

  //********************Event Listeners*****************/

  // Event Listener -> Summary button
  // window.addEventListener("DOMContentLoaded", () => {
  //   document.getElementById("short-summary-btn")?.addEventListener("click", () => {
  //       if (shortSummary)
  //         pushChatMessage(
  //           "bot",
  //           `<strong>Short Summary:</strong><p>${shortSummary}</p>`
  //         );
  //     });

  //   document.getElementById("long-summary-btn")?.addEventListener("click", () => {
  //       if (longSummary)
  //         pushChatMessage(
  //           "bot",
  //           `<strong>Long Summary:</strong><p>${longSummary}</p>`
  //         );
  //     });
  // });

  // Event Listener -> Refresh chat on page refresh
  window.addEventListener("beforeunload", () => {
    localStorage.removeItem("CHAT_STORAGE_KEY");
  });

  // Event Listener -> Options Button
  panel.querySelector(".chat-history").addEventListener("click", (event) => {
    const button = event.target.closest(".option-button");
    if (!button) return;

    const label = button.dataset.label;
    handleOptionClick(label);
  });

  // Event Listener -> Send Button
  panel.querySelector(".send-btn").addEventListener("click", () => {
    const input = panel.querySelector(".chat-input-box input");
    const userText = input.value.trim();
    if (!userText) return;

    // Bot is typing...
    chatHistory.push({
      sender: "user",
      text: userText,
      messageType: "userInput",
    });
    input.value = "";

    loadingResponse();

    callPerplexityToAnswerUserPrompt(userText);

    // setTimeout(() => {
    //   responseLoaded();
    //   chatHistory.push({
    //     sender: "bot",
    //     text: "Thanks! I'm processing your question. (This is a simulated response.)",
    //     messageType: "loading"
    //   });
    //   renderChat();
    // }, 3000);
  });

  // Event Listener -> Input box (Enter)
  panel
    .querySelector(".chat-input-box input")
    .addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        panel.querySelector(".send-btn").click();
      }
    });

  // Event Listener -> Reset chat button (Enter)
  panel.querySelector(".reset-chat-btn").addEventListener("click", () => {
    // localStorage.removeItem(CHAT_STORAGE_KEY);
    resetVariables();
    chatHistory.push(defaultMessage);
    prepareChatbot();
  });

  //Event Listener -> Floating button

  button.addEventListener("click", () => {
    isOpen = !isOpen;
    panel.style.display = isOpen ? "block" : "none";

    if (isOpen) {
      // If XML hasn’t loaded yet and loading message isn’t already shown, add it
      if (
        !haveLatestXml &&
        !chatHistory.some((msg) => msg?.messageType == "fetchingXML")
      ) {
        chatHistory.push(defaultMessage);
      }
      renderChat();
    }
  });

  //******************** main.js *****************/

  document.body.appendChild(button);
  document.body.appendChild(panel);

  //loadChat();
  resetVariables();
  renderChat();
  prepareChatbot();
})();
