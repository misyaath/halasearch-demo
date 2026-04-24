import {ChatOllama} from "@langchain/ollama";
import {StateGraph, START, END, MessagesAnnotation, Annotation} from "@langchain/langgraph";
import {SystemMessage, ToolMessage, AIMessage} from "@langchain/core/messages";
import {deepResearchTool} from "./searchTool";
import {Pool} from "pg";
import {PostgresSaver} from "@langchain/langgraph-checkpoint-postgres";
import {z} from "zod"

const llm = new ChatOllama({
    model: "llama3.1",
    baseUrl: process.env.OLLAMA_BASE_URL,
    temperature: 0,
    topP: 0.9,
    numCtx: 16384,
    numPredict: 4096
});

const tools = [deepResearchTool];
const llmWithTools = llm.bindTools(tools);

const reactSchema = z.object({
    thought: z.string().describe("Your internal reasoning. Do you have enough data to give a perfect answer, or do you need to use a tool?"),
    action: z.string().optional().describe("The name of the tool to use (e.g., 'deep_research_tool'). Omit if you are ready to answer."),
    action_input: z.string().optional().describe("A JSON formatted string of the arguments for the tool. Omit if no tool is used."),
    final_answer: z.string().optional().describe("The final response for the user. ONLY fill this if you have the complete answer. Omit if you need to search.")
});

const GraphState = Annotation.Root({
    ...MessagesAnnotation.spec,
    agent_decision: Annotation<z.infer<typeof reactSchema> | null>({
        reducer: (current, next) => next !== undefined ? next : current,
        default: () => null,
    })
});

async function callLlm(state: typeof GraphState.State) {
    console.log("running llm.. \n");

    const reactSystemPrompt = `
You are a professional Real Estate ReAct Agent. Your goal is to answer the user's request by synthesizing data from your chat memory AND a SINGLE web search.

EVALUATION PROTOCOL:
1. ANALYZE MEMORY: Read the chat history. Determine what relevant properties or data you already know.
2. SEARCH ONCE (If incomplete): If your memory does not contain the COMPLETE answer to the user's request, use tools to get data.
3. SYNTHESIZE & RETURN: If you have all the data you need from memory, OR if the last message in the chat history is a result from tools. Write the 'final_answer' by combining the properties you remember from the history WITH the new properties from the search results.

FINAL ANSWER FORMAT:
When you provide the 'final_answer', you MUST format each property listing clearly and include the following details (if the data is available):
- Name (Building/Community)
- Location
- Price
- Amenities
- Nearby Locations
- Other Service Charges (e.g., DEWA, SEWA, Chiller fees)
- Link: The Source URL to the property. (CRITICAL: If the search tool did not provide a link, you MUST write "Link: Not specified by search tool").
- ALL links related to result

CRITICAL RULES:
- MERGE DATA: Your final answer should intelligently combine relevant properties discussed earlier in the chat PLUS any new ones just found by the tool.
- NO HALLUCINATIONS: NEVER make up property names, prices, links, or charges. If a specific detail is missing, state "Not specified".
- NO ENDLESS LOOPS: Never trigger the tool twice in a row for the same request. If the search returned zero results, output a 'final_answer' using only the memory you have, and apologize for the lack of new results.
`;
    const response = await llmWithTools.invoke([
        new SystemMessage(reactSystemPrompt),
        ...state.messages
    ]);

    return {'messages': [response]}
}

function shouldContinue(state: typeof GraphState.State) {
    console.log("Evaluating ...\n");
    const lastMessage = state.messages[state.messages.length - 1];

    if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
        return "action";
    }
    return END;
}

async function takeAction(state: typeof GraphState.State) {
    console.log("Running Action ...\n");

    const lastMessage = state.messages[state.messages.length - 1];
    const lastToolCall = lastMessage.tool_calls || [];
    const results = [];

    for (const t of lastToolCall) {
        console.log("calling: " + t.name)

        const tool = tools.find(tool => tool.name === t.name);
        if (tool) {
            const result = await tool.invoke(t.args);
            results.push(
                new ToolMessage({
                    tool_call_id: t.id,
                    name: t.name,
                    content: String(result)
                })
            );
        } else {
            console.error(`Tool ${t.name} not found!`);
        }
    }
    console.log("Back to the model!");
    return {messages: results};
}

const workflow = new StateGraph(GraphState)
    .addNode("llm", callLlm)
    .addNode("action", takeAction)
    .addEdge(START, "llm")
    .addConditionalEdges("llm", shouldContinue)
    .addEdge("action", "llm");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});
const checkpoint = new PostgresSaver(pool);

export async function getAgentExecutor(isFollowUp: boolean) {
    await checkpoint.setup();
    return workflow.compile({checkpointer: checkpoint});
}