// functions/api/generate-image.js
export async function onRequestPost(context) {
    const { prompt, size } = await context.request.json();
  
    if (!prompt) {
      return new Response(JSON.stringify({ error: "Prompt is required for image generation." }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  
    const dashscopeApiKey = context.env.DASHSCOPE_API_KEY;
    if (!dashscopeApiKey) {
      console.error("DASHSCOPE_API_KEY is not set in environment variables.");
      return new Response(JSON.stringify({ error: "Server configuration error: API key missing." }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
      });
    }
  
    console.log(`Image generation request: Prompt: "${prompt}", Size: "${size || 'default'}"`);
  
    const synthesisPayload = {
      model: "wanx2.1-t2i-turbo",
      input: {
        prompt: prompt,
        negative_prompt: "人物" // 根据需要调整或配置
      },
      parameters: {
        size: size || "1024*1024",
        n: 1
      }
    };
  
    try {
      console.log("Sending image synthesis request to DashScope:", JSON.stringify(synthesisPayload, null, 2));
      const synthesisResponse = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis', {
        method: 'POST',
        headers: {
          'X-DashScope-Async': 'enable',
          'Authorization': `Bearer ${dashscopeApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(synthesisPayload)
      });
  
      const synthesisData = await synthesisResponse.json();
      console.log("Received synthesis response from DashScope:", JSON.stringify(synthesisData, null, 2));
  
      if (!synthesisResponse.ok || !synthesisData.output || !synthesisData.output.task_id) {
        console.error('DashScope Synthesis API error or no task_id:', synthesisData);
        return new Response(JSON.stringify({
          error: 'Failed to initiate image generation task with DashScope.',
          details: synthesisData.message || synthesisData.output || synthesisData
        }), { status: synthesisResponse.status > 0 ? synthesisResponse.status : 500, headers: { 'Content-Type': 'application/json' } });
      }
  
      const taskId = synthesisData.output.task_id;
      console.log(`Image generation task started with ID: ${taskId}`);
  
      let attempts = 0;
      const maxAttempts = 30; // 30 * 3s = 90s timeout
      let taskResult;
      let taskStatus = synthesisData.output.task_status;
  
      // Helper function for delay
      const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  
      while ((taskStatus === 'PENDING' || taskStatus === 'RUNNING') && attempts < maxAttempts) {
        attempts++;
        await delay(3000); // 3秒轮询
  
        console.log(`Polling task ${taskId}, attempt ${attempts}, status: ${taskStatus}`);
        const taskQueryResponse = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${dashscopeApiKey}` }
        });
  
        taskResult = await taskQueryResponse.json();
        console.log(`Polling response for task ${taskId}:`, JSON.stringify(taskResult, null, 2));
        
        if (taskResult.output && taskResult.output.task_status) {
          taskStatus = taskResult.output.task_status;
        } else {
          console.warn("Unexpected polling response structure, continuing poll:", taskResult);
        }
      }
  
      if (taskStatus === 'SUCCEEDED') {
        if (taskResult.output && taskResult.output.results && taskResult.output.results.length > 0 && taskResult.output.results[0].url) {
          const imageUrl = taskResult.output.results[0].url;
          console.log(`Task ${taskId} succeeded. Image URL: ${imageUrl}`);
          return new Response(JSON.stringify({ imageUrl: imageUrl }), { headers: { 'Content-Type': 'application/json' } });
        } else {
          console.error('DashScope Task API success but no image URL:', taskResult);
          return new Response(JSON.stringify({ error: 'Image generation succeeded but no image URL found.', details: taskResult }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
      } else {
        console.error('DashScope Task did not succeed. Status:', taskStatus, 'Details:', taskResult);
        return new Response(JSON.stringify({ error: `Image generation task ended with status: ${taskStatus}`, details: taskResult.output ? taskResult.output.message : taskResult }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
  
    } catch (error) {
      console.error('Error in /api/generate-image function:', error);
      return new Response(JSON.stringify({ error: 'Internal server error during image generation.', details: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }