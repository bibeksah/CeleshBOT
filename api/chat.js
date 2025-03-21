// Import required dependencies
const { OpenAI } = require('openai');

// Basic error handling for environment variables
const checkEnvVars = () => {
  const azureOpenAIKey = process.env.AZURE_OPENAI_KEY;
  const azureOpenAIEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  
  if (!azureOpenAIKey || !azureOpenAIEndpoint) {
    throw new Error("Missing required environment variables: AZURE_OPENAI_KEY and/or AZURE_OPENAI_ENDPOINT");
  }
  
  return { azureOpenAIKey, azureOpenAIEndpoint };
};

// Serverless function handler
module.exports = async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    
    // Handle GET requests with a friendly message
    if (req.method === 'GET') {
      return res.status(200).json({ 
        message: "Chat API is running. Please use POST method with a JSON body containing a 'message' field." 
      });
    }
  
  try {
    // Check environment variables
    const { azureOpenAIKey, azureOpenAIEndpoint } = checkEnvVars();
    
    // Create client using AzureOpenAI constructor
    const client = new OpenAI.AzureOpenAI({
      apiKey: azureOpenAIKey,
      endpoint: azureOpenAIEndpoint,
      apiVersion: "2024-05-01-preview",
      defaultHeaders: { "api-key": azureOpenAIKey }
    });
    
    // Get message from request body
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }
    
    // Create assistant
    const assistant = await client.beta.assistants.create({
      model: "gpt-4o-mini",
      name: "Celesh",
      instructions: "You are Celesh, Nexalaris Tech's AI customer service assistant...",
      tools: [{ "type": "file_search" }],
      tool_resources: { "file_search": { "vector_store_ids": ["vs_BX5jd6fRpNWCPmZolnNJYY7s"] } }
    });
    
    // Create thread
    const thread = await client.beta.threads.create({});

    // Add message to thread
    await client.beta.threads.messages.create(thread.id, {
      role: "user",
      content: message
    });
    
    // Run assistant
    const run = await client.beta.threads.runs.create(
      thread.id,
      { assistant_id: assistant.id }
    );
    
    // Poll for completion (with timeout safeguard)
    let runStatus = run.status;
    let attempts = 0;
    const maxAttempts = 30;
    
    while ((runStatus === 'queued' || runStatus === 'in_progress') && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const runStatusResponse = await client.beta.threads.runs.retrieve(
        thread.id,
        run.id
      );
      runStatus = runStatusResponse.status;
      attempts++;
    }
    
    if (runStatus !== 'completed') {
      return res.status(500).json({ 
        error: "Run did not complete in time",
        status: runStatus
      });
    }
    
    // Get messages
    const messages = await client.beta.threads.messages.list(thread.id);
    
    // Find assistant's response
    const assistantMessage = messages.data.find(msg => msg.role === "assistant");
    
    if (!assistantMessage) {
      return res.status(500).json({ error: "No assistant message found" });
    }
    
    // Extract text content
    const textContent = assistantMessage.content.find(item => item.type === "text");
    
    if (!textContent || !textContent.text || !textContent.text.value) {
      return res.status(500).json({ error: "No text content found" });
    }
    
    // Return response
    return res.status(200).json({ reply: textContent.text.value });
    
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ 
      error: "An error occurred", 
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};