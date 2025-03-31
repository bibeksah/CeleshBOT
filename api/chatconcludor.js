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
      message: "API is running. Please use POST method with a JSON body containing your data."
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

    // Get data from request body
    const inputData = req.body;
    
    if (!inputData) {
      return res.status(400).json({ error: "Request body cannot be empty" });
    }

    // Create assistant with structured output instructions
    const assistant = await client.beta.assistants.create({
      model: "gpt-4o-mini",
      name: "Celesh",
      instructions: `You will analyze the conversation data provided and generate a structured response with exactly three sections:

1. Chat_conclusion: A brief summary of key points discussed and outcomes.
2. User_behavior_analysis: Identify patterns in user interactions, including tone, preferences, and recurring themes.
3. Chat_style: Describe the user's communication style, including their tone (formal/casual), message length, and stylistic tendencies.

Your response MUST be formatted as a JSON object with these three fields, each containing string content. DO NOT include any other fields or introductory text.

Example format:
{
  "chat_conclusion": "...",
  "user_behavior_analysis": "...",
  "chat_style": "..."
}`
    });

    // Create thread
    const thread = await client.beta.threads.create({});

    // Format the data based on its type and structure
    let formattedData;
    
    if (inputData.transcript && Array.isArray(inputData.transcript)) {
      // Handle transcript format from original code
      formattedData = inputData.transcript.map(entry => `${entry.role}: ${entry.text}`).join("\n");
    } else if (typeof inputData === 'object') {
      // Handle generic object data
      formattedData = JSON.stringify(inputData, null, 2);
    } else if (Array.isArray(inputData)) {
      // Handle array data
      formattedData = JSON.stringify(inputData, null, 2);
    } else {
      // Handle primitive types or anything else as string
      formattedData = String(inputData);
    }

    // Add data to thread
    await client.beta.threads.messages.create(thread.id, {
      role: "user",
      content: formattedData
    });

    // Run assistant with structured output instructions
    const run = await client.beta.threads.runs.create(
      thread.id,
      { 
        assistant_id: assistant.id,
        additional_instructions: `Return your analysis in a structured JSON format with exactly these three fields: "chat_conclusion", "user_behavior_analysis", and "chat_style". Make sure to properly format as valid JSON.`
      }
    );

    // Poll for completion (with timeout safeguard)
    let runStatus = run.status;
    let attempts = 0;
    const maxAttempts = 30;

    while ((runStatus === 'queued' || runStatus === 'in_progress') && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const runStatusResponse = await client.beta.threads.runs.retrieve(thread.id, run.id);
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

    // Parse the JSON response
    let parsedResponse;
    try {
      // Try to parse the response as JSON
      parsedResponse = JSON.parse(textContent.text.value);
      
      // Check if all required fields are present
      if (!parsedResponse.chat_conclusion || !parsedResponse.user_behavior_analysis || !parsedResponse.chat_style) {
        // If any fields are missing, create them with default values
        parsedResponse = {
          chat_conclusion: parsedResponse.chat_conclusion || "No conclusion provided",
          user_behavior_analysis: parsedResponse.user_behavior_analysis || "No user behavior analysis provided",
          chat_style: parsedResponse.chat_style || "No chat style analysis provided"
        };
      }
    } catch (e) {
      // If parsing fails, extract sections manually using regex
      const content = textContent.text.value;
      
      // Extract sections using regex
      const chatConclusionMatch = content.match(/chat_conclusion[:\s]+(.*?)(?=user_behavior_analysis|\n\n|$)/is);
      const userBehaviorMatch = content.match(/user_behavior_analysis[:\s]+(.*?)(?=chat_style|\n\n|$)/is);
      const chatStyleMatch = content.match(/chat_style[:\s]+(.*?)(?=\n\n|$)/is);
      
      parsedResponse = {
        chat_conclusion: chatConclusionMatch ? chatConclusionMatch[1].trim() : "No conclusion provided",
        user_behavior_analysis: userBehaviorMatch ? userBehaviorMatch[1].trim() : "No user behavior analysis provided",
        chat_style: chatStyleMatch ? chatStyleMatch[1].trim() : "No chat style analysis provided"
      };
    }

    // Return structured response
    return res.status(200).json({
      chat_conclusion: parsedResponse.chat_conclusion,
      user_behavior_analysis: parsedResponse.user_behavior_analysis,
      chat_style: parsedResponse.chat_style,
      metadata: {
        thread_id: thread.id,
        run_id: run.id
      }
    });

  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({
      error: "An error occurred",
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};