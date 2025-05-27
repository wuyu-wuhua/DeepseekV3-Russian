// functions/api/image-parsing.js
const TARGET_API_URL = 'https://aa.jstang.cn/api/ai/call';

export async function onRequestPost(context) {
  try {
    const formData = await context.request.formData();

    // FormData 会直接包含前端发送的所有字段，包括 'model_id', 'img', 'content', 'size', 'google_id'

    console.log("Forwarding request to image-parsing service (aa.jstang.cn).");
    // for (let [key, value] of formData.entries()) {
    //   console.log(`FormData ${key}:`, value instanceof File ? value.name : value);
    // }

    const response = await fetch(TARGET_API_URL, {
      method: 'POST',
      body: formData,
    });

    const responseBodyText = await response.text();

    if (!response.ok) {
      console.error(`Error from ${TARGET_API_URL} (image-parsing): ${response.status} - ${responseBodyText}`);
      let errorJson;
      try {
        errorJson = JSON.parse(responseBodyText);
         // 您之前遇到的 "图片格式不正确" 错误 {code: 400, msg: '图片格式不正确'} 会在这里
         // 前端 script.js 会尝试读取 errorData.error 或 errorData.details
         // 所以，确保我们返回的结构与前端的解析兼容
        if (errorJson.msg && !errorJson.details) errorJson.details = errorJson.msg;
        if (errorJson.code && !errorJson.error) errorJson.error = `API Error Code: ${errorJson.code}`;

      } catch (e) {
        errorJson = { error: `图像解析 API 错误: ${response.status}`, details: responseBodyText.substring(0, 200) };
      }
      return new Response(JSON.stringify(errorJson), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    try {
        const responseData = JSON.parse(responseBodyText);
        // 前端期望 data.data, data.text, 或 data.description 包含分析结果
        console.log("Image-parsing success response:", responseData);
        return new Response(JSON.stringify(responseData), {
          headers: { 'Content-Type': 'application/json' },
        });
    } catch (e) {
        console.warn("Image-parsing response was not valid JSON, returning as text:", responseBodyText);
         // 如果解析失败，但状态码是成功的，可能 API 返回的就是纯文本描述
        return new Response(responseBodyText, {
          headers: { 'Content-Type': response.headers.get('Content-Type') || 'text/plain' },
        });
    }

  } catch (error) {
    console.error('Error in /api/image-parsing function:', error);
    return new Response(JSON.stringify({ error: '处理图像解析请求失败', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}