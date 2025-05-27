// functions/api/image-to-image.js
const TARGET_API_URL = 'https://aa.jstang.cn/api/ai/call';

export async function onRequestPost(context) {
  try {
    const formData = await context.request.formData(); // Cloudflare Pages Functions V2 API

    // 确保 model_id (前端发送 '5') 存在或被正确转发
    // FormData 会直接包含前端发送的所有字段，包括 'model_id', 'img', 'content', 'size', 'google_id'

    console.log("Forwarding request to image-to-image service (aa.jstang.cn).");
    // Log FormData entries for debugging if needed (be careful with sensitive data in logs)
    // for (let [key, value] of formData.entries()) {
    //   console.log(`FormData ${key}:`, value instanceof File ? value.name : value);
    // }

    const response = await fetch(TARGET_API_URL, {
      method: 'POST',
      body: formData,
      // fetch会自动根据FormData设置合适的Content-Type (multipart/form-data)
    });

    const responseBodyText = await response.text(); // 获取原始文本以进行更灵活的错误处理

    if (!response.ok) {
      console.error(`Error from ${TARGET_API_URL} (image-to-image): ${response.status} - ${responseBodyText}`);
      let errorJson;
      try {
        errorJson = JSON.parse(responseBodyText); // 尝试解析为JSON
      } catch (e) {
        errorJson = { error: `图生图 API 错误: ${response.status}`, details: responseBodyText.substring(0, 200) };
      }
      return new Response(JSON.stringify(errorJson), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 尝试解析为 JSON，如果成功，则返回 JSON，否则返回原始文本（以防 API 返回非 JSON 成功响应）
    try {
        const responseData = JSON.parse(responseBodyText);
        // 前端期望 data.data 是图片URL
        console.log("Image-to-Image success response:", responseData);
        return new Response(JSON.stringify(responseData), {
          headers: { 'Content-Type': 'application/json' },
        });
    } catch (e) {
        console.warn("Image-to-Image response was not valid JSON, returning as text:", responseBodyText);
        return new Response(responseBodyText, { // 如果不是JSON，直接返回文本
          headers: { 'Content-Type': response.headers.get('Content-Type') || 'text/plain' },
        });
    }


  } catch (error) {
    console.error('Error in /api/image-to-image function:', error);
    return new Response(JSON.stringify({ error: '处理图生图请求失败', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}