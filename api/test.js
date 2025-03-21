module.exports = async (req, res) => {
    try {
      // Return environment variable check (safely without exposing values)
      const envCheck = {
        AZURE_OPENAI_KEY: !!process.env.AZURE_OPENAI_KEY,
        AZURE_OPENAI_ENDPOINT: !!process.env.AZURE_OPENAI_ENDPOINT
      };
      
      return res.status(200).json({
        message: "Test endpoint is working",
        method: req.method,
        env_check: envCheck,
        node_version: process.version
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  };