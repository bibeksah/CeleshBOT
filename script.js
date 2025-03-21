require('dotenv/config');
const { AzureOpenAI } = require('openai');

// Get environment variables
const azureOpenAIKey = process.env.AZURE_OPENAI_KEY;
const azureOpenAIEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
const azureOpenAIVersion = "2024-05-01-preview";

// Check env variables
if (!azureOpenAIKey || !azureOpenAIEndpoint) {
  throw new Error("Please set AZURE_OPENAI_KEY and AZURE_OPENAI_ENDPOINT in your environment variables.");
}

// Get Azure SDK client
const getClient = () => {
  const assistantsClient = new AzureOpenAI({
    endpoint: azureOpenAIEndpoint,
    apiVersion: azureOpenAIVersion,
    apiKey: azureOpenAIKey,
  });
  return assistantsClient;
};
const assistantsClient = getClient();

const options = {
  model: "gpt-4o-mini", // replace with model deployment name
  name: "Celesh",
  instructions: "You are Celesh, Nexalaris Tech's AI customer service assistant. Your primary objective is to deliver exceptional support while maintaining accurate customer records. Initial Greeting: Welcome to Nexalaris Tech! I'm Celesh, your dedicated assistant. To provide you with personalized service, please share: • Full Name • Email Address • Phone Number Your information will be handled securely and confidentially. Core Responsibilities: 1. Verify user details before proceeding 2. Address customers by first name throughout interactions 3. Provide solutions using: - Official Nexalaris knowledge base (primary source) - https://nexalaris.com (secondary) - AI-generated responses (Last resort) 4. Maintain professional yet friendly tone: - Use clear, jargon-free language - Express empathy and understanding - Keep responses concise and actionable Communication Framework: • Confirm information receipt: Thank you [First Name], your details are securely saved. • Address inquiry: How may I assist you today? • End conversations: Is there anything else I can help you with, [First Name]? Remember: Prioritize accuracy, maintain warmth, and ensure all responses align with Nexalaris Tech's standards of excellence.",
  tools: [{"type":"file_search"}],
  tool_resources: {"file_search":{"vector_store_ids":["vs_BX5jd6fRpNWCPmZolnNJYY7s"]}},
  temperature: 1,
  top_p: 1
};

const setupAssistant = async () => {
  try {
    const assistantResponse = await assistantsClient.beta.assistants.create(options);
    console.log(`Assistant created: ${JSON.stringify(assistantResponse)}`);
  } catch (error) {
    console.error(`Error creating assistant: ${error.message}`);
  }
};

setupAssistant();


const role = "user";
const message = "hi"; // Replace this with your prompt

const runAssistant = async () => {
  try {
    // Create a thread
    const assistantThread = await assistantsClient.beta.threads.create({});
    console.log(`Thread created: ${JSON.stringify(assistantThread)}`);

    // Add a user question to the thread
    const threadResponse = await assistantsClient.beta.threads.messages.create(
      assistantThread.id,
      {
        role,
        content: message,
      }
    );
    console.log(`Message created: ${JSON.stringify(threadResponse)}`);

    const assistantResponse = await assistantsClient.beta.assistants.create(options);
    // Run the thread and poll it until it is in a terminal state
    const runResponse = await assistantsClient.beta.threads.runs.create(
      assistantThread.id,
      {
        assistant_id: assistantResponse.id,
      }
    );
    console.log(`Run started: ${JSON.stringify(runResponse)}`);

    // Polling until the run completes or fails
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

    // Get the messages in the thread once the run has completed
    if (runStatus === 'completed') {
      const messagesResponse = await assistantsClient.beta.threads.messages.list(
        assistantThread.id
      );
      console.log(`Messages in the thread: ${JSON.stringify(messagesResponse)}`);
    } else {
      console.log(`Run status is ${runStatus}, unable to fetch messages.`);
    }
  } catch (error) {
    console.error(`Error running the assistant: ${error.message}`);
  }
};

runAssistant();