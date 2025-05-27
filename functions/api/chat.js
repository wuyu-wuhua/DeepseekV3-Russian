// functions/api/chat.js
export async function onRequestPost(context) {
    try {
      const requestData = await context.request.json();
      const { userMessage, systemMessage, useCase } = requestData;
  
      if (!userMessage) {
        return new Response(JSON.stringify({ error: "userMessage is required" }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
  
      let messages = [];
      if (systemMessage) {
        messages.push({ role: "system", content: systemMessage });
      } else {
        messages.push({ role: "system", content: "You are a helpful assistant." });
      }
      messages.push({ role: "user", content: userMessage });
  
      const dashscopeApiKey = context.env.DASHSCOPE_API_KEY;
      if (!dashscopeApiKey) {
          console.error("DASHSCOPE_API_KEY is not set in environment variables.");
          return new Response(JSON.stringify({ error: "Server configuration error: API key missing." }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
          });
      }
  
      console.log("Sending to DashScope Chat API. Model: qwen-plus. Use Case:", useCase);
  
      const completionResponse = await fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${dashscopeApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: "qwen-plus", // 您可以根据 useCase 动态选择模型
          messages: messages,
        }),
      });
  
      if (!completionResponse.ok) {
        const errorData = await completionResponse.json().catch(() => ({}));
        console.error('DashScope Chat API error:', completionResponse.status, errorData);
        return new Response(JSON.stringify({
          error: 'Failed to get a valid response from AI provider.',
          details: errorData
        }), {
          status: completionResponse.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }
  
      const completion = await completionResponse.json();
  
      if (completion.choices && completion.choices.length > 0 && completion.choices[0].message) {
        return new Response(JSON.stringify({ botResponse: completion.choices[0].message.content }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } else {
        console.error("Unexpected API response structure from DashScope Chat:", completion);
        return new Response(JSON.stringify({ error: "Failed to parse response from AI provider." }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
  
    } catch (error) {
      console.error('Error in /api/chat function:', error);
      return new Response(JSON.stringify({ error: '处理聊天请求失败', details: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }