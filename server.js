require('dotenv/config');
const express = require('express');
const { AzureOpenAI } = require('openai');

const app = express();
app.use(express.json()); // ✅ Ensures JSON parsing

// ✅ Get environment variables
const azureOpenAIKey = process.env.AZURE_OPENAI_KEY;
const azureOpenAIEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
const azureOpenAIVersion = "2024-05-01-preview";

if (!azureOpenAIKey || !azureOpenAIEndpoint) {
  throw new Error("Please set AZURE_OPENAI_KEY and AZURE_OPENAI_ENDPOINT in your environment variables.");
}

// ✅ Create the Azure OpenAI client **once**
const assistantsClient = new AzureOpenAI({
  endpoint: azureOpenAIEndpoint,
  apiVersion: azureOpenAIVersion,
  apiKey: azureOpenAIKey,
  defaultHeaders: { "api-key": azureOpenAIKey }, 
});

// ✅ Define assistant options
const options = {
  model: "gpt-4o-mini", // Replace with your model deployment name
  name: "Celesh",
  instructions: "You are Celesh, Nexalaris Tech's AI customer service assistant...",
  tools: [{ "type": "file_search" }],
  tool_resources: { "file_search": { "vector_store_ids": ["vs_BX5jd6fRpNWCPmZolnNJYY7s"] } },
  temperature: 1,
  top_p: 1
};

// ✅ **Create the assistant ONCE at startup**
let assistantInstance;
const setupAssistant = async () => {
  try {
    assistantInstance = await assistantsClient.beta.assistants.create(options);
    console.log(`Assistant created: ${JSON.stringify(assistantInstance)}`);
  } catch (error) {
    console.error(`Error creating assistant: ${error.message}`);
  }
};
setupAssistant(); // ✅ Call it once when the server starts

// ✅ **Chat Endpoint**
app.post('/chat', async (req, res) => {
  console.log("Received request body:", req.body); // Debugging

  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  try {
    // ✅ Create a new thread
    const assistantThread = await assistantsClient.beta.threads.create({});
    console.log(`Thread created: ${JSON.stringify(assistantThread)}`);

    // ✅ Add user message to the thread
    await assistantsClient.beta.threads.messages.create(assistantThread.id, {
      role: "user",
      content: message,
    });

    // ✅ Run the assistant thread
    const runResponse = await assistantsClient.beta.threads.runs.create(
      assistantThread.id,
      { assistant_id: assistantInstance.id }
    );
    console.log(`Run started: ${JSON.stringify(runResponse)}`);

    // ✅ Poll until the assistant has completed processing the request
    let runStatus = runResponse.status;
    while (runStatus === 'queued' || runStatus === 'in_progress') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const runStatusResponse = await assistantsClient.beta.threads.runs.retrieve(
        assistantThread.id,
        runResponse.id
      );
      runStatus = runStatusResponse.status;
      console.log(`Current run status: ${runStatus}`);
    }

    // ✅ Retrieve the messages once the AI has responded
    if (runStatus === 'completed') {
      const messagesResponse = await assistantsClient.beta.threads.messages.list(assistantThread.id);
      console.log(`Messages received: ${JSON.stringify(messagesResponse)}`); // Debugging

      // ✅ Extract the AI's response correctly
      const assistantMessages = messagesResponse.data || [];
      if (assistantMessages.length === 0) {
        return res.status(500).json({ error: "No messages found in response" });
      }

      // ✅ Find the latest assistant response
      const lastMessageObj = assistantMessages.reverse().find(msg => msg.role === "assistant");

      if (!lastMessageObj || !lastMessageObj.content || !Array.isArray(lastMessageObj.content)) {
        return res.status(500).json({ error: "Invalid message format received from AI" });
      }

      // ✅ Extract the AI response text from the correct structure
      const lastMessageText = lastMessageObj.content.find(item => item.type === "text");

      if (!lastMessageText || !lastMessageText.text || !lastMessageText.text.value) {
        return res.status(500).json({ error: "No valid text response found" });
      }

      return res.json({ reply: lastMessageText.text.value });
    } else {
      return res.status(500).json({ error: "Failed to complete the chat run" });
    }
  } catch (error) {
    console.error("Error in /chat:", error);
    return res.status(500).json({ error: error.message });
  }
});

// ✅ Start Express server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
