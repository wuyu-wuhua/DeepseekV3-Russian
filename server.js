const express = require('express');
const OpenAI = require('openai');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const port = 3001; // Вы можете выбрать другой порт, если этот занят

// ВАЖНО: Безопасность API ключа!
// Для локальной разработки можно использовать ключ напрямую, НО НИКОГДА не загружайте его в таком виде
// в публичные репозитории или на продакшн. Используйте переменные окружения в продакшене.
const apiKey = "sk-2705410b977d4fe98f9434630ea371bc";

const openai = new OpenAI({
    apiKey: apiKey,
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
});

app.use(cors()); // Разрешает CORS-запросы (для разработки)
app.use(express.json()); // Для парсинга JSON-тела запросов

app.post('/api/chat', async (req, res) => {
    try {
        const { userMessage, systemMessage, useCase } = req.body;

        if (!userMessage) {
            return res.status(400).json({ error: "userMessage is required" });
        }

        let messages = [];
        if (systemMessage) {
            messages.push({ role: "system", content: systemMessage });
        } else {
            // Общая системная подсказка по умолчанию, если конкретная не предоставлена
            messages.push({ role: "system", content: "You are a helpful assistant." });
        }
        messages.push({ role: "user", content: userMessage });

        // Логирование для отладки
        console.log("Sending to API:", JSON.stringify(messages, null, 2));
        console.log("Using model: qwen-plus (or model for use case if specified later)");

        const completion = await openai.chat.completions.create({
            model: "qwen-plus", // Или можно будет менять модель в зависимости от useCase
            messages: messages,
            // stream: true, // Для потоковой передачи (пока не реализуем для простоты)
        });

        // Логирование ответа от API
        // console.log("Received from API:", JSON.stringify(completion, null, 2));

        if (completion.choices && completion.choices.length > 0 && completion.choices[0].message) {
            res.json({ botResponse: completion.choices[0].message.content });
        } else {
            console.error("Unexpected API response structure:", completion);
            res.status(500).json({ error: "Failed to get a valid response from AI" });
        }

    } catch (error) {
        console.error('Error calling OpenAI API:', error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        res.status(500).json({ error: 'Failed to communicate with AI service' });
    }
});

// +++ 新增文生图接口 +++
app.post('/api/generate-image', async (req, res) => {
    const { prompt, size } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: "Prompt is required for image generation." });
    }

    console.log(`Received /api/generate-image request with prompt: "${prompt}", size: "${size || 'default'}"`);

    const synthesisPayload = {
        model: "wanx2.1-t2i-turbo", // 根据您提供的curl示例
        input: {
            prompt: prompt,
            negative_prompt: "人物" // 您可以根据需要修改或使其可配置
        },
        parameters: {
            size: size || "1024*1024", // 如果前端未提供尺寸，则使用默认值
            n: 1 // 生成图片的数量
        }
    };

    try {
        // 第1步: 调用通义万相API发起图片生成任务
        console.log("Sending image synthesis request to DashScope:", JSON.stringify(synthesisPayload, null, 2));
        const synthesisResponse = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis', {
            method: 'POST',
            headers: {
                'X-DashScope-Async': 'enable', // 异步调用
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(synthesisPayload)
        });

        const synthesisData = await synthesisResponse.json();
        console.log("Received synthesis response from DashScope:", JSON.stringify(synthesisData, null, 2));

        if (!synthesisResponse.ok || !synthesisData.output || !synthesisData.output.task_id) {
            console.error('DashScope Synthesis API error or no task_id:', synthesisData);
            return res.status(500).json({ 
                error: 'Failed to initiate image generation task with DashScope.', 
                details: synthesisData.message || synthesisData.output || synthesisData 
            });
        }
        
        const taskId = synthesisData.output.task_id;
        console.log(`Image generation task started with ID: ${taskId}`);

        // 第2步: 轮询任务结果
        let attempts = 0;
        const maxAttempts = 30; // 最多轮询30次 (例如，30 * 3秒 = 90秒超时)
        let taskResult;
        let taskStatus = synthesisData.output.task_status;

        while ((taskStatus === 'PENDING' || taskStatus === 'RUNNING') && attempts < maxAttempts) {
            attempts++;
            await new Promise(resolve => setTimeout(resolve, 3000)); // 每3秒轮询一次

            console.log(`Polling task ${taskId}, attempt ${attempts}, current status: ${taskStatus}`);
            const taskQueryResponse = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                }
            });

            taskResult = await taskQueryResponse.json();
            console.log(`Polling response for task ${taskId}:`, JSON.stringify(taskResult, null, 2));

            if (!taskQueryResponse.ok) {
                console.error('DashScope Task API error during polling:', taskResult);
                // 不立即返回，允许继续轮询或等待最终状态
            }
            
            taskStatus = taskResult.output.task_status;
        }

        if (taskStatus === 'SUCCEEDED') {
            if (taskResult.output.results && taskResult.output.results.length > 0 && taskResult.output.results[0].url) {
                const imageUrl = taskResult.output.results[0].url;
                console.log(`Task ${taskId} succeeded. Image URL: ${imageUrl}`);
                res.json({ imageUrl: imageUrl });
            } else {
                console.error('DashScope Task API success but no image URL:', taskResult);
                res.status(500).json({ error: 'Image generation succeeded but no image URL found in response.', details: taskResult });
            }
        } else if (taskStatus === 'FAILED') {
            console.error('DashScope Task failed:', taskResult);
            res.status(500).json({ error: 'Image generation task failed.', details: taskResult.output.message || taskResult });
        } else { // 包括 TIMEOUT 或其他未成功状态
            console.error('DashScope Task did not succeed. Status:', taskStatus, 'Details:', taskResult);
            res.status(500).json({ error: `Image generation task ended with status: ${taskStatus}`, details: taskResult });
        }

    } catch (error) {
        console.error('Error in /api/generate-image endpoint:', error);
        res.status(500).json({ error: 'Internal server error during image generation process.' });
    }
});
// +++ 结束新增文生图接口 +++

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
}); 