import {getAgentExecutor} from "../../../lib/agent";
import {HumanMessage} from "@langchain/core/messages";

export async function POST(req: Request) {
    const {prompt, chatId} = await req.json();

    if (!prompt || !chatId) {
        return Response.json({error: "prompt and chatId are required"}, {status: 400});
    }

    const stream = new ReadableStream({
        async start(controller) {
            try {
                const config = {configurable: {thread_id: chatId}};

                const p = prompt.toLowerCase();
                const isFollowUp = false;

                const agentExecutor = await getAgentExecutor(isFollowUp);
                const strictPrompt = isFollowUp
                    ? `${prompt}\n\n[SYSTEM REMINDER: You have no search tools available. You MUST answer this question by analyzing the properties already listed in our chat history above.]`
                    : prompt;

                const eventStream = agentExecutor.streamEvents(
                    {messages: [new HumanMessage(strictPrompt)]} as any,
                    {...config, version: "v2"}
                );

                let jsonBuffer = "";
                for await (const event of eventStream) {
                    const eventType = event.event;

                    // 2. ACCUMULATE CHUNKS: Add the raw JSON fragments to the buffer
                    if (eventType === "on_chat_model_stream") {
                        const chunk = event.data.chunk.content;
                        if (typeof chunk === "string") {
                            jsonBuffer += chunk;
                        }
                    }

                    // 3. PARSE & SEND: When the model stops typing, parse the JSON and extract the text
                    if (eventType === "on_chat_model_end") {
                        if (jsonBuffer.trim()) {
                            let textToSend = "";

                            try {
                                // 1. Try to parse it as strict JSON
                                const parsedData = JSON.parse(jsonBuffer);
                                textToSend = parsedData.final_answer || "";
                            } catch (error) {
                                // 2. GRACEFUL FALLBACK: If it's plain text, just send the whole buffer!
                                console.warn("LLM ignored JSON schema. Sending raw text to UI.");
                                textToSend = jsonBuffer;
                            }

                            // Send the extracted text to the frontend
                            if (textToSend && textToSend.trim() !== "") {
                                controller.enqueue(
                                    new TextEncoder().encode(`data: ${JSON.stringify({
                                        type: "text",
                                        content: textToSend
                                    })}\n\n`)
                                );
                            }
                        }

                        jsonBuffer = ""; // Clear buffer for next turn
                    }

                    // 4. TOOL EXECUTION: Safely extract tool arguments
                    if (eventType === "on_tool_start") {
                        const query = event.data.input?.optimized_query8    `` || event.name;
                        controller.enqueue(
                            new TextEncoder().encode(`data: ${JSON.stringify({
                                type: "tool",
                                content: query
                            })}\n\n`)
                        );
                    }
                }
                controller.close();
            } catch (error) {
                console.error("Stream Error:", error);
                controller.error(error);
            }
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    });
}